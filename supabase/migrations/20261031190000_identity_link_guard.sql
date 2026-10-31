-- Linking and unlinking sign in methods, with a recent sign in proven by
-- the session that asks.
--
-- Linking another identity (for example a Google account) to a user, or
-- removing one, needs a link intent: a row in private.identity_intents that
-- POST /api/account/identity-intent writes after checking that the session
-- making that request signed in within the last 10 minutes (its own `amr`
-- claim, REAUTH_WINDOW_MS in src/lib/api/reauth.ts). The intent is for one
-- action and provider, lasts five minutes and is used once, in the same
-- transaction as the change. Supabase Auth would otherwise accept a link
-- from any valid session if manual linking is on, so a stolen session could
-- add the attacker's Google account and keep access after sign out. The
-- database cannot tell which session sent a request to Auth, which is why
-- the proof is made by our own route first.
--
-- Allowed without an intent: the first identity of a new user, an identity
-- for the account's own email that the provider verified (Supabase links
-- those by itself at sign in, including Google taking over an unconfirmed
-- email sign up), Supabase cleaning up an unconfirmed account, and the
-- cascade when an account is deleted. Never allowed: removing the last
-- identity, or removing the one that carries the account's email within 24
-- hours of linking a new one. Making an intent ends linking flows started
-- earlier, so a flow from a session that has since been signed out cannot
-- use it.
--
-- We sign in with email links and Google only, so passwords are not kept:
-- existing ones are cleared, a new account gets none, and one cannot be set
-- later (a session could otherwise set a password and come back with it).
--
-- The account owner is emailed when a way to sign in is added or removed,
-- and when the account email changes (old and new address). The address is
-- the account email at the time of the change, so a change that also moves
-- the account email still reaches the owner.
--
-- Triggers on the auth schema are not an officially supported extension
-- point. The functions live in private, run as their owner with an empty
-- search path, and only touch auth tables, private.identity_intents and
-- email_queue.

-- Intents ------------------------------------------------------------------

create table private.identity_intents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('link', 'unlink')),
  provider text not null check (provider ~ '^[a-z0-9_]{1,30}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  used_at timestamptz
);

create index identity_intents_lookup_idx
  on private.identity_intents (user_id, action, provider, expires_at)
  where used_at is null;

alter table private.identity_intents enable row level security;

-- Called by POST /api/account/identity-intent with the service role, after
-- it has checked the request's own session. Ten intents an hour per person.
create function public.create_identity_intent(p_user uuid, p_action text, p_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('identity_intent:' || p_user::text, 0));

  if (
    select count(*) from private.identity_intents
    where user_id = p_user and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'rate_limited' using errcode = 'PT429',
      hint = 'Try again in an hour.';
  end if;

  delete from private.identity_intents
  where user_id = p_user and created_at < now() - interval '1 day';

  -- A linking flow started earlier (OAuth authorize, valid for minutes and
  -- tied to no session) could otherwise finish with this intent after the
  -- session that started it was signed out. Only the fresh session can
  -- start a new one.
  delete from auth.flow_state where linking_target_id = p_user;

  insert into private.identity_intents (user_id, action, provider)
  values (p_user, p_action, p_provider);
end;
$$;

-- Uses an open intent for this change, or says there is none.
create function private.use_identity_intent(p_user uuid, p_action text, p_provider text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  used bigint;
begin
  update private.identity_intents
  set used_at = now()
  where id = (
    select i.id from private.identity_intents i
    where i.user_id = p_user
      and i.action = p_action
      and i.provider = p_provider
      and i.used_at is null
      and i.expires_at > now()
    order by i.created_at
    limit 1
    for update skip locked
  )
  returning id into used;
  return used is not null;
end;
$$;

-- Guards --------------------------------------------------------------------

create function private.identities_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_email text;
begin
  -- The first identity of a new user.
  if not exists (select 1 from auth.identities where user_id = new.user_id) then
    return new;
  end if;

  -- Supabase linking a sign in for the same email, which the provider has
  -- verified.
  select u.email into account_email from auth.users u where u.id = new.user_id;
  if account_email is not null
    and lower(btrim(new.identity_data ->> 'email')) = lower(btrim(account_email))
    and coalesce(new.identity_data ->> 'email_verified', '') = 'true'
  then
    return new;
  end if;

  -- A linking flow that was started before the intent was made belongs to
  -- an older session; it cannot use the intent.
  if exists (
    select 1 from auth.flow_state f
    where f.linking_target_id = new.user_id
      and f.created_at < (
        select min(i.created_at) from private.identity_intents i
        where i.user_id = new.user_id
          and i.action = 'link'
          and i.provider = new.provider
          and i.used_at is null
          and i.expires_at > now()
      )
  ) then
    raise exception 'identity_link_requires_recent_sign_in' using errcode = '42501',
      detail = 'Sign in again to add a way to sign in.';
  end if;

  if not private.use_identity_intent(new.user_id, 'link', new.provider) then
    raise exception 'identity_link_requires_recent_sign_in' using errcode = '42501',
      detail = 'Sign in again to add a way to sign in.';
  end if;

  return new;
end;
$$;

create function private.identities_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  confirmed timestamptz;
  account_email text;
  found_user boolean;
begin
  -- One change per user at a time, so two removals cannot both see the
  -- other identity and leave none.
  select true, u.email_confirmed_at, u.email into found_user, confirmed, account_email
  from auth.users u where u.id = old.user_id for update;

  -- Deleting the account: the user row is already gone when its identities
  -- are removed by the cascade.
  if found_user is null then
    return old;
  end if;

  if not exists (
    select 1 from auth.identities where user_id = old.user_id and id <> old.id
  ) then
    raise exception 'identity_unlink_last' using errcode = '42501',
      detail = 'Keep at least one way to sign in.';
  end if;

  -- Supabase removing the identities of an unconfirmed account when a
  -- verified sign in for the same email takes it over (before it confirms
  -- the account).
  if confirmed is null then
    return old;
  end if;

  -- The identity that carries the account email stays for a day after a
  -- new way to sign in was added, so a new link cannot at once take over
  -- where security emails go.
  if lower(btrim(coalesce(old.identity_data ->> 'email', ''))) = lower(btrim(coalesce(account_email, '')))
    and exists (
      select 1 from auth.identities
      where user_id = old.user_id and id <> old.id and created_at > now() - interval '24 hours'
    )
  then
    raise exception 'identity_unlink_too_soon' using errcode = '42501',
      detail = 'Try again tomorrow.';
  end if;

  if not private.use_identity_intent(old.user_id, 'unlink', old.provider) then
    raise exception 'identity_unlink_requires_recent_sign_in' using errcode = '42501',
      detail = 'Sign in again to remove a way to sign in.';
  end if;

  return old;
end;
$$;

create trigger identities_require_recent_sign_in
  before insert on auth.identities
  for each row execute function private.identities_before_insert();

create trigger identities_require_recent_sign_in_delete
  before delete on auth.identities
  for each row execute function private.identities_before_delete();

-- No passwords --------------------------------------------------------------
-- A new account gets no password (Supabase sets a random one for email
-- link sign ups), and one cannot be set or changed later. Clearing is fine.
-- Local fixtures (seeding) keep theirs.

create function private.users_no_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_seeding() then
      new.encrypted_password := null;
    end if;
    return new;
  end if;

  if coalesce(new.encrypted_password, '') <> ''
    and new.encrypted_password is distinct from old.encrypted_password
  then
    raise exception 'password_sign_in_disabled' using errcode = '42501',
      detail = 'Sign in with an email link or Google.';
  end if;
  return new;
end;
$$;

create trigger users_no_password
  before insert or update of encrypted_password on auth.users
  for each row execute function private.users_no_password();

-- Passwords set before this, for example by a sign up that was never
-- confirmed, would otherwise stay a way in.
update auth.users set encrypted_password = null where coalesce(encrypted_password, '') <> '';

-- Security emails -------------------------------------------------------------

alter table public.email_queue alter column notification_id drop not null;
alter table public.email_queue
  add column kind text check (kind in ('identity_linked', 'identity_unlinked', 'email_changed')),
  add column payload jsonb,
  -- For security emails: the account email when the change happened.
  add column recipient text check (char_length(recipient) <= 320),
  -- How many addresses the email went to, for the daily budget.
  add column sends integer not null default 1 check (sends between 1 and 5);
alter table public.email_queue add constraint email_queue_one_source check (
  (notification_id is not null and kind is null and payload is null and recipient is null)
  or (notification_id is null and kind is not null and payload is not null and recipient is not null)
);

create function private.identities_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  provider text;
  address text;
  account_email text;
  confirmed timestamptz;
  remaining integer;
begin
  if tg_op = 'INSERT' then
    uid := new.user_id;
    provider := new.provider;
    address := new.identity_data ->> 'email';
  else
    uid := old.user_id;
    provider := old.provider;
    address := old.identity_data ->> 'email';
  end if;

  -- The account email as it is now, before anything this change leads to.
  select u.email, u.email_confirmed_at into account_email, confirmed
  from auth.users u where u.id = uid;

  -- Not when the account is being deleted, has no profile, has no email to
  -- write to, or is unconfirmed (Supabase taking over an unconfirmed sign
  -- up, not a change to an account someone already uses).
  if not found
    or confirmed is null
    or coalesce(account_email, '') = ''
    or not exists (select 1 from public.profiles where id = uid)
  then
    return null;
  end if;

  -- Only for people who already had a way to sign in (not at sign up).
  select count(*) into remaining from auth.identities where user_id = uid;
  if (tg_op = 'INSERT' and remaining < 2) or (tg_op = 'DELETE' and remaining < 1) then
    return null;
  end if;

  -- At most three security emails per person a day, so linking and
  -- unlinking in a loop cannot use up the email quota. Removing the way to
  -- sign in that carries the account email is always emailed.
  if not (
    tg_op = 'DELETE'
    and lower(btrim(coalesce(address, ''))) = lower(btrim(account_email))
  ) and (
    select count(*) from public.email_queue
    where user_id = uid and kind is not null and created_at > now() - interval '1 day'
  ) >= 3 then
    return null;
  end if;

  insert into public.email_queue (user_id, kind, payload, recipient)
  values (
    uid,
    case when tg_op = 'INSERT' then 'identity_linked' else 'identity_unlinked' end,
    jsonb_build_object('provider', provider, 'email', left(coalesce(address, ''), 320), 'at', now()),
    left(account_email, 320)
  );
  return null;
end;
$$;

create trigger identities_notify
  after insert or delete on auth.identities
  for each row execute function private.identities_notify();

-- A changed account email is emailed to the old and the new address,
-- always.
create function private.users_notify_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(old.email, '') = ''
    or old.email_confirmed_at is null
    or lower(btrim(old.email)) = lower(btrim(coalesce(new.email, '')))
    or not exists (select 1 from public.profiles where id = new.id)
  then
    return null;
  end if;

  insert into public.email_queue (user_id, kind, payload, recipient)
  values (
    new.id,
    'email_changed',
    jsonb_build_object('email', left(coalesce(new.email, ''), 320), 'at', now()),
    left(old.email, 320)
  );
  return null;
end;
$$;

create trigger users_notify_email_change
  after update of email on auth.users
  for each row execute function private.users_notify_email_change();

-- The digest only takes notification rows; security emails go one by one.
create or replace function public.email_batch(p_limit integer default 20, p_daily_budget integer default 60)
returns table (user_id uuid, email text, total integer, items jsonb, queue_ids bigint[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent_today integer;
  room integer;
begin
  -- Security notices (no notification_id) are sent whatever the setting.
  delete from public.email_queue q
  using public.profiles p
  where q.user_id = p.id
    and q.sent_at is null
    and q.notification_id is not null
    and (not p.email_notifications or p.banned_at is not null);

  delete from public.email_queue q
  using public.notifications n
  where q.notification_id = n.id
    and q.sent_at is null
    and (
      not exists (select 1 from public.tracks t where t.id = n.track_id and t.status = 'live')
      or (n.comment_id is not null
        and not exists (select 1 from public.comments c where c.id = n.comment_id and c.status = 'live'))
    );

  -- One email per sent_at (each send marks its rows in one call), counted
  -- by the addresses it went to.
  select coalesce(sum(per_email.sends), 0) into sent_today
  from (
    select max(q.sends) as sends from public.email_queue q
    where q.sent_at > now() - interval '1 day'
    group by q.sent_at
  ) per_email;
  room := least(greatest(p_limit, 0), greatest(p_daily_budget - sent_today, 0), 80);

  return query
  with picked as (
    select q.user_id
    from public.email_queue q
    join auth.users u on u.id = q.user_id
    where q.sent_at is null
      and q.notification_id is not null
      and q.attempts < 3
      and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
      and u.email is not null
    group by q.user_id
    order by min(q.created_at)
    limit room
  ),
  claimed as (
    update public.email_queue q
    set claimed_at = now()
    from picked
    where q.user_id = picked.user_id
      and q.sent_at is null
      and q.notification_id is not null
      and q.attempts < 3
      and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
    returning q.id, q.user_id, q.notification_id, q.created_at
  )
  select c.user_id, u.email::text, count(*)::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'kind', n.kind,
        'actor', coalesce(nullif(a.display_name, ''), a.handle),
        'track_title', t.title,
        'track_slug', t.slug,
        'time_ms', cm.time_ms
      ) order by n.created_at desc
    ) filter (where c.rn <= 20), '[]'::jsonb),
    array_agg(c.id)
  from (
    select claimed.*, row_number() over (partition by claimed.user_id order by claimed.created_at desc) as rn
    from claimed
  ) c
  join public.notifications n on n.id = c.notification_id
  join auth.users u on u.id = c.user_id
  join public.tracks t on t.id = n.track_id
  left join public.profiles a on a.id = n.actor_id
  left join public.comments cm on cm.id = n.comment_id
  group by c.user_id, u.email;
end;
$$;

create function public.security_email_batch(p_limit integer default 20, p_daily_budget integer default 60)
returns table (queue_id bigint, user_id uuid, recipients text[], kind text, payload jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sent_today integer;
  room integer;
begin
  -- Security emails share the daily budget with the digest.
  -- One email per sent_at (each send marks its rows in one call), counted
  -- by the addresses it went to.
  select coalesce(sum(per_email.sends), 0) into sent_today
  from (
    select max(q.sends) as sends from public.email_queue q
    where q.sent_at > now() - interval '1 day'
    group by q.sent_at
  ) per_email;
  room := least(greatest(p_limit, 0), greatest(p_daily_budget - sent_today, 0), 50);

  return query
  with picked as (
    select q.id
    from public.email_queue q
    where q.kind is not null
      and q.sent_at is null
      and q.attempts < 3
      and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
    order by q.created_at
    limit room
    for update of q skip locked
  ),
  claimed as (
    update public.email_queue q
    set claimed_at = now()
    from picked
    where q.id = picked.id
    returning q.id, q.user_id, q.kind, q.payload, q.recipient
  )
  -- The address from the time of the change, and the current one if it
  -- has moved since.
  select c.id, c.user_id,
    array(
      select distinct a from unnest(array[c.recipient, u.email::text]) a
      where coalesce(a, '') <> ''
    ),
    c.kind, c.payload
  from claimed c
  left join auth.users u on u.id = c.user_id;
end;
$$;

-- Marking sent records how many addresses the email went to.
drop function public.mark_emails_sent(bigint[]);
create function public.mark_emails_sent(p_ids bigint[], p_sends integer default 1)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_queue
  set sent_at = now(), sends = least(greatest(p_sends, 1), 5)
  where id = any (p_ids) and sent_at is null;
$$;

revoke all on private.identity_intents from public, anon, authenticated;
revoke execute on function public.mark_emails_sent(bigint[], integer) from public, anon, authenticated;
grant execute on function public.mark_emails_sent(bigint[], integer) to service_role;
revoke execute on function private.users_notify_email_change() from public, anon, authenticated;
revoke execute on function public.create_identity_intent(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.use_identity_intent(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.identities_before_insert() from public, anon, authenticated;
revoke execute on function private.identities_before_delete() from public, anon, authenticated;
revoke execute on function private.users_no_password() from public, anon, authenticated;
revoke execute on function private.identities_notify() from public, anon, authenticated;
revoke execute on function public.email_batch(integer, integer) from public, anon, authenticated;
revoke execute on function public.security_email_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.create_identity_intent(uuid, text, text) to service_role;
grant execute on function public.email_batch(integer, integer) to service_role;
grant execute on function public.security_email_batch(integer, integer) to service_role;
