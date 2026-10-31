-- Recent sign in for linking and unlinking sign in methods.
--
-- Linking another identity (for example a Google account) to a user, or
-- removing one, needs a session that signed in within the last 10 minutes
-- (private.reauth_window(), kept equal to REAUTH_WINDOW_MS in the app). The
-- app asks for that already, but Supabase Auth would accept the request from
-- any valid session if manual linking is on, so a stolen or forgotten
-- session could add the attacker's Google account and keep access after the
-- victim signs out. The rule now holds in the database, where every path
-- into auth.identities passes.
--
-- A recent sign in means an email link, Google or password sign in, not a
-- factor someone added to an old session. Allowed without one: the first
-- identity of a new user, an identity for the account's own email that the
-- provider verified (Supabase links those by itself at sign in), and
-- Supabase cleaning up an unconfirmed account. Never allowed: removing the
-- last identity. Deleting the whole account removes identities as before.
-- Setting a password on an existing account is blocked too: it would be
-- another way to sign in that needs no identity.
--
-- When a user who already had a way to sign in gets one added or removed,
-- we email them (email_queue rows without a notification, sent whatever the
-- notification setting is).
--
-- Triggers on the auth schema are not an officially supported extension
-- point. The functions live in private, run as their owner with an empty
-- search path, and only read auth tables and write email_queue.

create function private.reauth_window()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '10 minutes';
$$;

-- The AMR methods that are a sign in. Others (totp, phone, webauthn) can be
-- added to an existing session by whoever holds it, so they prove nothing
-- here. Kept equal to SIGN_IN_METHODS in src/lib/api/reauth.ts.
create function private.sign_in_methods()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['otp', 'magiclink', 'oauth', 'password', 'email/signup'];
$$;

-- True when the user has a live session whose sign in proof (an AMR claim,
-- the source of the `amr` timestamps in its tokens) is recent.
create function private.has_recent_sign_in(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions s
    join auth.mfa_amr_claims c on c.session_id = s.id
    where s.user_id = p_user
      and (s.not_after is null or s.not_after > now())
      and c.authentication_method = any (private.sign_in_methods())
      and c.updated_at > now() - private.reauth_window()
      and c.updated_at <= now() + interval '1 minute'
  );
$$;

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
  -- verified. This also covers an account whose email was never confirmed:
  -- signing in with Google for that address confirms it.
  select u.email into account_email from auth.users u where u.id = new.user_id;
  if account_email is not null
    and lower(btrim(new.identity_data ->> 'email')) = lower(btrim(account_email))
    and coalesce(new.identity_data ->> 'email_verified', '') = 'true'
  then
    return new;
  end if;

  if not private.has_recent_sign_in(new.user_id) then
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
  found_user boolean;
begin
  -- One change per user at a time, so two removals cannot both see the
  -- other identity and leave none.
  select true, u.email_confirmed_at into found_user, confirmed
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

  if not private.has_recent_sign_in(old.user_id) then
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
-- We sign in with email links and Google only. A session could otherwise
-- set a password with PUT /auth/v1/user and sign in with it later, without
-- touching auth.identities. A password can be cleared, not set or changed
-- on an existing account.

create function private.users_block_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.encrypted_password, '') <> ''
    and new.encrypted_password is distinct from old.encrypted_password
  then
    raise exception 'password_sign_in_disabled' using errcode = '42501',
      detail = 'Sign in with an email link or Google.';
  end if;
  return new;
end;
$$;

create trigger users_block_password
  before update of encrypted_password on auth.users
  for each row execute function private.users_block_password();

-- Security emails -------------------------------------------------------------

alter table public.email_queue alter column notification_id drop not null;
alter table public.email_queue
  add column kind text check (kind in ('identity_linked', 'identity_unlinked')),
  add column payload jsonb;
alter table public.email_queue add constraint email_queue_one_source check (
  (notification_id is not null and kind is null and payload is null)
  or (notification_id is null and kind is not null and payload is not null)
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

  select count(*) into remaining from auth.identities where user_id = uid;

  -- Not for an unconfirmed account: that is Supabase taking over an
  -- unconfirmed sign up, not a change to an account someone already uses.
  if exists (select 1 from auth.users where id = uid and email_confirmed_at is null) then
    return null;
  end if;

  -- At most three security emails per person a day, so linking and
  -- unlinking in a loop cannot use up the email quota.
  if (
    select count(*) from public.email_queue
    where user_id = uid and kind is not null and created_at > now() - interval '1 day'
  ) >= 3 then
    return null;
  end if;

  -- Only for people who already had a way to sign in (not at sign up) and
  -- still have an account (not when it is deleted).
  if not exists (select 1 from auth.users where id = uid)
    or not exists (select 1 from public.profiles where id = uid)
    or (tg_op = 'INSERT' and remaining < 2)
    or (tg_op = 'DELETE' and remaining < 1)
  then
    return null;
  end if;

  insert into public.email_queue (user_id, kind, payload)
  values (
    uid,
    case when tg_op = 'INSERT' then 'identity_linked' else 'identity_unlinked' end,
    jsonb_build_object('provider', provider, 'email', left(coalesce(address, ''), 320), 'at', now())
  );
  return null;
end;
$$;

create trigger identities_notify
  after insert or delete on auth.identities
  for each row execute function private.identities_notify();

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

  -- Each email marks its rows in one call, so one sent_at per email.
  select count(distinct q.sent_at) into sent_today
  from public.email_queue q where q.sent_at > now() - interval '1 day';
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

create function public.security_email_batch(p_limit integer default 20)
returns table (queue_id bigint, user_id uuid, email text, kind text, payload jsonb)
language sql
volatile
security definer
set search_path = ''
as $$
  with picked as (
    select q.id
    from public.email_queue q
    join auth.users u on u.id = q.user_id
    where q.kind is not null
      and q.sent_at is null
      and q.attempts < 3
      and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
      and u.email is not null
    order by q.created_at
    limit least(greatest(p_limit, 1), 50)
    for update of q skip locked
  ),
  claimed as (
    update public.email_queue q
    set claimed_at = now()
    from picked
    where q.id = picked.id
    returning q.id, q.user_id, q.kind, q.payload
  )
  select c.id, c.user_id, u.email::text, c.kind, c.payload
  from claimed c
  join auth.users u on u.id = c.user_id;
$$;

revoke execute on function private.reauth_window() from public, anon, authenticated;
revoke execute on function private.sign_in_methods() from public, anon, authenticated;
revoke execute on function private.users_block_password() from public, anon, authenticated;
revoke execute on function private.has_recent_sign_in(uuid) from public, anon, authenticated;
revoke execute on function private.identities_before_insert() from public, anon, authenticated;
revoke execute on function private.identities_before_delete() from public, anon, authenticated;
revoke execute on function private.identities_notify() from public, anon, authenticated;
revoke execute on function public.email_batch(integer, integer) from public, anon, authenticated;
revoke execute on function public.security_email_batch(integer) from public, anon, authenticated;
grant execute on function public.email_batch(integer, integer) to service_role;
grant execute on function public.security_email_batch(integer) to service_role;
