-- Functions and triggers: profile creation, validation, counters,
-- reputation, rate limits, notifications and auto hide on reports.
--
-- Counters and limits live here and not in application code, so they hold
-- no matter where a write comes from. Error codes:
--   PT429 rate_limited     PostgREST answers with HTTP 429
--   42501 not_allowed      HTTP 403
--   22023 <reason>         HTTP 400, invalid input

-- Admin check --------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'True when the calling user has role admin. Used by RLS policies.';

-- Reputation levels --------------------------------------------------------

-- Level for a given number of Helpful marks. Raises if the config is missing.
create function public.reputation_level(p_helpful integer)
returns public.reputation_levels
language plpgsql
stable
set search_path = ''
as $$
declare
  result public.reputation_levels;
begin
  select l.*
  into result
  from public.reputation_levels l
  where l.min_helpful <= greatest(p_helpful, 0)
  order by l.min_helpful desc
  limit 1;

  if not found then
    raise exception 'reputation config missing'
      using hint = 'Apply supabase/seeds/reputation.sql (pnpm db:config).';
  end if;

  return result;
end;
$$;

-- Profiles -----------------------------------------------------------------

create function private.random_suffix(p_length integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, p_length);
$$;

-- Creates a profile for every new auth user. The handle comes from the
-- `handle` metadata field (magic link sign up), or from the name on the
-- OAuth account. It is never derived from the email address, since the
-- handle is public.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base text;
  candidate text;
  attempts integer := 0;
  display text;
  avatar text;
begin
  base := lower(coalesce(meta ->> 'handle', meta ->> 'preferred_username',
    meta ->> 'full_name', meta ->> 'name', ''));
  base := left(regexp_replace(base, '[^a-z0-9_]+', '', 'g'), 15);
  if char_length(base) < 3 then
    base := 'producer';
  end if;

  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate)
    or exists (select 1 from public.reserved_handles where handle = candidate)
  loop
    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'could not find a free handle';
    end if;
    candidate := base || '_' || private.random_suffix(4);
  end loop;

  display := left(btrim(coalesce(
    nullif(btrim(meta ->> 'display_name'), ''),
    nullif(btrim(meta ->> 'full_name'), ''),
    nullif(btrim(meta ->> 'name'), ''),
    candidate
  )), 50);

  avatar := coalesce(meta ->> 'avatar_url', meta ->> 'picture');
  if avatar !~ '^https://' or char_length(avatar) > 500 then
    avatar := null;
  end if;

  insert into public.profiles (id, handle, display_name, avatar_url)
  values (new.id, candidate, display, avatar);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.handle := lower(btrim(new.handle));
  new.display_name := btrim(new.display_name);
  new.bio := btrim(new.bio);

  if (tg_op = 'INSERT' or new.handle is distinct from old.handle)
    and exists (select 1 from public.reserved_handles where handle = new.handle)
  then
    raise exception 'handle_reserved' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function private.profiles_before_write();

-- Rate limits --------------------------------------------------------------

-- Checks and records one rate limited action for a user. Concurrent writes
-- by the same user are serialized with an advisory lock, so two parallel
-- requests cannot both slip under the limit.
create function private.consume_rate_limit(p_user uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  helpful integer;
  lim public.reputation_levels;
  used_hour integer;
  used_day integer;
  used_week integer;
begin
  if private.is_seeding() then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action || ':' || p_user::text, 0));

  select reputation into helpful from public.profiles where id = p_user;
  lim := public.reputation_level(coalesce(helpful, 0));

  select
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*) filter (where created_at > now() - interval '1 day'),
    count(*)
  into used_hour, used_day, used_week
  from private.rate_limit_events
  where user_id = p_user
    and action = p_action
    and created_at > now() - interval '7 days';

  if (p_action = 'track' and used_day >= lim.tracks_per_day) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'tracks_per_day',
        hint = format('You can upload %s tracks per day.', lim.tracks_per_day);
  elsif (p_action = 'track' and used_week >= lim.tracks_per_week) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'tracks_per_week',
        hint = format('You can upload %s tracks per week.', lim.tracks_per_week);
  elsif (p_action = 'comment' and used_hour >= lim.comments_per_hour) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'comments_per_hour',
        hint = format('You can post %s comments per hour.', lim.comments_per_hour);
  elsif (p_action = 'report' and used_day >= lim.reports_per_day) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'reports_per_day',
        hint = format('You can send %s reports per day.', lim.reports_per_day);
  end if;

  insert into private.rate_limit_events (user_id, action) values (p_user, p_action);
end;
$$;

-- How many more tracks the calling user may upload right now. Used by
-- /api/upload/sign so nobody uploads a file that would then be rejected.
create function public.track_upload_allowance()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  helpful integer;
  lim public.reputation_levels;
  used_day integer;
  used_week integer;
begin
  if uid is null then
    return 0;
  end if;

  select reputation into helpful from public.profiles where id = uid;
  if not found then
    return 0;
  end if;
  lim := public.reputation_level(helpful);

  select
    count(*) filter (where created_at > now() - interval '1 day'),
    count(*)
  into used_day, used_week
  from private.rate_limit_events
  where user_id = uid
    and action = 'track'
    and created_at > now() - interval '7 days';

  return greatest(0, least(lim.tracks_per_day - used_day, lim.tracks_per_week - used_week));
end;
$$;

-- Tracks -------------------------------------------------------------------

create function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-'),
    60
  );
$$;

-- Lowercases, trims and dedupes tags, then checks each one: letters,
-- digits, spaces and hyphens, 1 to 24 characters.
create function private.normalize_tags(p_tags text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  result text[];
begin
  select coalesce(array_agg(distinct t order by t), '{}')
  into result
  from (
    select btrim(regexp_replace(lower(tag), '\s+', ' ', 'g')) as t
    from unnest(coalesce(p_tags, '{}')) as tag
  ) normalized
  where t <> '';

  if exists (select 1 from unnest(result) t where t !~ '^[a-z0-9]([a-z0-9 -]{0,22}[a-z0-9])?$') then
    raise exception 'invalid_tag' using errcode = '22023';
  end if;

  return result;
end;
$$;

create function private.tracks_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
begin
  new.title := btrim(new.title);
  new.description := btrim(new.description);
  new.tags := private.normalize_tags(new.tags);
  new.feedback_wants := array(select distinct unnest(new.feedback_wants) order by 1);

  -- Fixtures keep their own slugs so tests can link to them.
  if private.is_seeding() and new.slug <> '' then
    return new;
  end if;

  base := btrim(left(private.slugify(new.title), 60), '-');
  new.slug := case when base = '' then '' else base || '-' end || private.random_suffix(8);

  if private.is_seeding() then
    return new;
  end if;

  -- Counters start at zero whoever inserts the row.
  new.play_count := 0;
  new.comment_count := 0;
  new.reaction_counts := '{}'::jsonb;
  new.created_at := now();
  new.published_at := now();

  -- The audio and peaks objects must exist in the owner's folder and belong
  -- to the owner. The key format is checked by table constraints.
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'audio'
      and o.name = new.audio_key
      and o.owner_id = new.owner_id::text
  ) then
    raise exception 'audio_object_missing' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'peaks'
      and o.name = new.peaks_key
      and o.owner_id = new.owner_id::text
  ) then
    raise exception 'peaks_object_missing' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles where id = new.owner_id and banned_at is not null) then
    new.status := 'hidden';
  end if;

  perform private.consume_rate_limit(new.owner_id, 'track');

  return new;
end;
$$;

create trigger tracks_before_insert
  before insert on public.tracks
  for each row execute function private.tracks_before_insert();

create function private.tracks_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.description := btrim(new.description);
  new.tags := private.normalize_tags(new.tags);
  new.feedback_wants := array(select distinct unnest(new.feedback_wants) order by 1);
  return new;
end;
$$;

create trigger tracks_before_update
  before update of title, description, tags, feedback_wants on public.tracks
  for each row execute function private.tracks_before_update();

-- Comments -----------------------------------------------------------------

create function private.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  track_duration integer;
  parent public.comments;
begin
  new.body := btrim(new.body);

  select duration_ms into track_duration from public.tracks where id = new.track_id;
  if new.time_ms is not null and new.time_ms > track_duration then
    raise exception 'time_out_of_range' using errcode = '22023';
  end if;

  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if not found or parent.track_id <> new.track_id or parent.parent_id is not null then
      raise exception 'invalid_parent' using errcode = '22023';
    end if;
  end if;

  if private.is_seeding() then
    return new;
  end if;

  new.is_helpful := false;
  new.helpful_at := null;
  new.resolved_at := null;
  new.edited_at := null;
  new.created_at := now();
  new.status := 'live';

  if exists (select 1 from public.profiles where id = new.author_id and banned_at is not null) then
    new.status := 'hidden';
  end if;

  perform private.consume_rate_limit(new.author_id, 'comment');

  return new;
end;
$$;

create trigger comments_before_insert
  before insert on public.comments
  for each row execute function private.comments_before_insert();

-- RLS decides who may update a comment row at all: the author, or the owner
-- of the track. This trigger decides which columns each of them may change.
-- Only requests from signed in end users are restricted. The trigger runs as
-- security definer, so the caller is read from the JWT, not current_user.
-- Admin functions only change `status`, which end users have no grant for.
create function private.comments_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  track_owner uuid;
begin
  if coalesce((select auth.jwt()) ->> 'role', '') not in ('authenticated', 'anon') then
    if new.is_helpful and not old.is_helpful then
      new.helpful_at := coalesce(new.helpful_at, now());
    elsif not new.is_helpful then
      new.helpful_at := null;
    end if;
    return new;
  end if;

  select owner_id into track_owner from public.tracks where id = old.track_id;

  if (new.body, new.category, new.time_ms) is distinct from (old.body, old.category, old.time_ms) then
    if uid is distinct from old.author_id then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only the author can edit a comment.';
    end if;
    new.body := btrim(new.body);
    if new.time_ms is not null
      and new.time_ms > (select duration_ms from public.tracks where id = old.track_id)
    then
      raise exception 'time_out_of_range' using errcode = '22023';
    end if;
    new.edited_at := now();
  end if;

  if new.is_helpful is distinct from old.is_helpful then
    if uid is distinct from track_owner then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only the track owner can mark a comment as Helpful.';
    end if;
    if old.author_id = track_owner then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'You cannot mark your own comment as Helpful.';
    end if;
    new.helpful_at := case when new.is_helpful then now() end;
  else
    new.helpful_at := old.helpful_at;
  end if;

  if new.resolved_at is distinct from old.resolved_at then
    if uid is distinct from track_owner then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only the track owner can resolve a comment.';
    end if;
    new.resolved_at := case when new.resolved_at is not null then now() end;
  end if;

  return new;
end;
$$;

create trigger comments_before_update
  before update on public.comments
  for each row execute function private.comments_before_update();

-- Counters -----------------------------------------------------------------

create function private.refresh_comment_count(p_track uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tracks
  set comment_count = (
    select count(*) from public.comments
    where track_id = p_track and status = 'live'
  )
  where id = p_track;
$$;

create function private.refresh_reputation(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set reputation = (
    select count(*) from public.comments
    where author_id = p_user and is_helpful and status = 'live'
  )
  where id = p_user;
$$;

create function private.comments_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      perform private.refresh_comment_count(new.track_id);
    end if;
    if (tg_op = 'INSERT' and new.is_helpful)
      or (tg_op = 'UPDATE'
        and (new.is_helpful is distinct from old.is_helpful
          or (old.is_helpful and new.status is distinct from old.status)))
    then
      perform private.refresh_reputation(new.author_id);
    end if;
  else
    perform private.refresh_comment_count(old.track_id);
    if old.is_helpful then
      perform private.refresh_reputation(old.author_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger comments_after_write
  after insert or update or delete on public.comments
  for each row execute function private.comments_after_write();

create function private.reactions_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.track_id, old.track_id);
begin
  update public.tracks
  set reaction_counts = coalesce((
    select jsonb_object_agg(kind, n)
    from (
      select kind, count(*) as n
      from public.reactions
      where track_id = target
      group by kind
    ) counts
  ), '{}'::jsonb)
  where id = target;
  return null;
end;
$$;

create trigger reactions_after_write
  after insert or delete on public.reactions
  for each row execute function private.reactions_after_write();

-- Notifications ------------------------------------------------------------

create function private.comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  track_owner uuid;
  parent_author uuid;
begin
  select owner_id into track_owner from public.tracks where id = new.track_id;

  if tg_op = 'INSERT' then
    if new.status <> 'live' then
      return null;
    end if;

    if new.parent_id is not null then
      select author_id into parent_author from public.comments where id = new.parent_id;
      if parent_author is distinct from new.author_id then
        insert into public.notifications (user_id, kind, actor_id, track_id, comment_id)
        values (parent_author, 'reply', new.author_id, new.track_id, new.id);
      end if;
    end if;

    if track_owner <> new.author_id and track_owner is distinct from parent_author then
      insert into public.notifications (user_id, kind, actor_id, track_id, comment_id)
      values (track_owner, 'comment', new.author_id, new.track_id, new.id);
    end if;
  elsif new.is_helpful and not old.is_helpful
    and not exists (
      select 1 from public.notifications
      where comment_id = new.id and kind = 'helpful'
    )
  then
    insert into public.notifications (user_id, kind, actor_id, track_id, comment_id)
    values (new.author_id, 'helpful', track_owner, new.track_id, new.id);
  end if;

  return null;
end;
$$;

create trigger comments_notify_insert
  after insert on public.comments
  for each row execute function private.comments_notify();

create trigger comments_notify_helpful
  after update of is_helpful on public.comments
  for each row execute function private.comments_notify();

-- Reports ------------------------------------------------------------------

create function private.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_seeding() then
    return new;
  end if;

  new.status := 'open';
  new.resolved_by := null;
  new.resolved_at := null;
  new.created_at := now();
  new.details := btrim(new.details);

  perform private.consume_rate_limit(new.reporter_id, 'report');
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function private.reports_before_insert();

-- Three open reports from different, established accounts hide the target
-- until an admin has looked at it. Accounts younger than a day do not count,
-- so a single person cannot hide something with fresh throwaway accounts.
create function private.reports_auto_hide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporters integer;
begin
  select count(distinct r.reporter_id)
  into reporters
  from public.reports r
  join public.profiles p on p.id = r.reporter_id
  where r.status = 'open'
    and r.target_type = new.target_type
    and r.track_id is not distinct from new.track_id
    and r.comment_id is not distinct from new.comment_id
    and p.created_at <= now() - interval '1 day'
    and p.banned_at is null;

  if reporters >= 3 then
    if new.target_type = 'track' then
      update public.tracks set status = 'hidden'
      where id = new.track_id and status = 'live';
    else
      update public.comments set status = 'hidden'
      where id = new.comment_id and status = 'live';
    end if;
  end if;

  return null;
end;
$$;

create trigger reports_auto_hide
  after insert on public.reports
  for each row execute function private.reports_auto_hide();
