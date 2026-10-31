-- Versions of a track.
--
-- A track has versions 1 to 10 (VERSIONS_MAX in src/config/versions.ts).
-- Version 1 is created with the track; later ones through
-- POST /api/tracks/[id]/versions, which verifies the upload like
-- /api/tracks does. The track's audio_key, peaks_key and duration_ms always
-- mirror its latest version, so feeds and pages keep working unchanged.
--
-- Each version keeps its own audio and peaks, a note about what changed
-- (at most 500 characters) and its loudness, measured in the browser while
-- decoding, so the player can match levels when comparing versions.
--
-- Comments belong to the version they were given on (comments.version_id).
-- Existing comments move to version 1. Replies take their parent's version.
--
-- Quota: a new version within 24 hours of the previous one is the same work
-- and does not count against the upload limit; later ones do. Uploading a
-- version uses the same reservation and /api/upload/sign (with trackId).
--
-- Old versions stay readable to whoever can see the track, and their files
-- are only cleaned up once no version uses them.

create table public.track_versions (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  version_no integer not null check (version_no between 1 and 10),
  audio_key text not null unique,
  peaks_key text not null unique,
  duration_ms integer not null check (duration_ms between 1000 and 900000),
  -- Integrated loudness in LUFS, null when the browser did not measure it.
  loudness numeric(5, 2) check (loudness between -70 and 0),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint track_versions_number unique (track_id, version_no)
);

create index track_versions_track_id_idx on public.track_versions (track_id, version_no desc);

alter table public.track_versions enable row level security;
revoke all on public.track_versions from anon, authenticated;
grant select on public.track_versions to anon, authenticated;

-- A version is visible to whoever can see its track (the subquery runs with
-- the caller's RLS on tracks).
create policy "Versions of visible tracks are public" on public.track_versions
  for select to anon, authenticated
  using (exists (select 1 from public.tracks t where t.id = track_versions.track_id));

-- Version 1 for every existing track.
insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms, created_at)
select id, 1, audio_key, peaks_key, duration_ms, created_at from public.tracks;

-- Version 1 is created with the track.
create function private.tracks_create_first_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms, created_at)
  values (new.id, 1, new.audio_key, new.peaks_key, new.duration_ms, new.created_at);
  return null;
end;
$$;

create trigger tracks_create_first_version
  after insert on public.tracks
  for each row execute function private.tracks_create_first_version();

-- Later versions: numbered by the database, at most 10, only on live
-- tracks of owners who are not banned, with uploaded files in the owner's
-- folder and a valid reservation, and the upload limit unless the previous
-- version is less than 24 hours old.
create function private.track_versions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  track public.tracks;
  previous public.track_versions;
begin
  select * into track from public.tracks where id = new.track_id for update;

  select * into previous from public.track_versions
  where track_id = new.track_id order by version_no desc limit 1;

  -- Version 1, from the track insert.
  if previous.id is null then
    new.version_no := 1;
    return new;
  end if;

  new.version_no := previous.version_no + 1;
  new.note := btrim(new.note);

  if private.is_seeding() then
    return new;
  end if;

  new.created_at := now();

  if new.version_no > 10 then
    raise exception 'version_limit' using errcode = '22023',
      detail = 'A track can have at most 10 versions.';
  end if;

  if track.status <> 'live'
    or exists (select 1 from public.profiles where id = track.owner_id and banned_at is not null)
  then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if split_part(new.audio_key, '/', 1) <> track.owner_id::text
    or split_part(new.peaks_key, '/', 1) <> track.owner_id::text
    or new.audio_key !~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$'
    or new.peaks_key <> regexp_replace(new.audio_key, '\.mp3$', '.json')
  then
    raise exception 'invalid_key' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'audio' and o.name = new.audio_key and o.owner_id = track.owner_id::text
  ) then
    raise exception 'audio_object_missing' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'peaks' and o.name = new.peaks_key and o.owner_id = track.owner_id::text
  ) then
    raise exception 'peaks_object_missing' using errcode = '22023';
  end if;

  delete from private.upload_reservations
  where object_id::text = split_part(split_part(new.audio_key, '/', 2), '.', 1)
    and user_id = track.owner_id
    and expires_at > now();
  if not found then
    raise exception 'upload_expired' using errcode = '22023',
      detail = 'Upload the file again.';
  end if;

  if previous.created_at < now() - interval '24 hours' then
    perform private.consume_rate_limit(track.owner_id, 'track');
  end if;

  return new;
end;
$$;

create trigger track_versions_before_insert
  before insert on public.track_versions
  for each row execute function private.track_versions_before_insert();

-- The track mirrors its latest version.
create function private.track_versions_mirror()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.version_no > 1 then
    update public.tracks
    set audio_key = new.audio_key, peaks_key = new.peaks_key, duration_ms = new.duration_ms
    where id = new.track_id;
  end if;
  return null;
end;
$$;

create trigger track_versions_mirror
  after insert on public.track_versions
  for each row execute function private.track_versions_mirror();

-- Comments --------------------------------------------------------------------

alter table public.comments add column version_id uuid references public.track_versions (id) on delete cascade;

update public.comments c
set version_id = v.id
from public.track_versions v
where v.track_id = c.track_id and v.version_no = 1 and c.version_id is null;

-- Never null: the insert trigger always sets it. A check constraint rather
-- than NOT NULL, so clients can leave it out of an insert.
alter table public.comments add constraint comments_version_set check (version_id is not null);
create index comments_version_id_idx on public.comments (version_id);

grant insert (version_id) on public.comments to authenticated;

create or replace function private.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_duration integer;
  parent public.comments;
begin
  new.body := btrim(new.body);

  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if not found
      or parent.track_id <> new.track_id
      or parent.parent_id is not null
      or parent.status <> 'live'
    then
      raise exception 'invalid_parent' using errcode = '22023';
    end if;
    -- A reply belongs to its parent's moment in the track, and version.
    new.time_ms := parent.time_ms;
    new.version_id := parent.version_id;
  end if;

  -- A comment is about the version it was given on: the one sent, or the
  -- latest. It must belong to the same track.
  if new.version_id is null then
    select v.id into new.version_id from public.track_versions v
    where v.track_id = new.track_id order by v.version_no desc limit 1;
  end if;

  select v.duration_ms into version_duration from public.track_versions v
  where v.id = new.version_id and v.track_id = new.track_id;
  if not found then
    raise exception 'invalid_version' using errcode = '22023';
  end if;

  if new.time_ms is not null and new.time_ms > version_duration then
    raise exception 'time_out_of_range' using errcode = '22023';
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

create or replace function private.comments_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  track_owner uuid;
  body_changed boolean := false;
begin
  -- Replies always sit at their parent's current time, whoever writes.
  if old.parent_id is not null then
    select p.time_ms into new.time_ms from public.comments p where p.id = old.parent_id;
  end if;

  if coalesce((select auth.jwt()) ->> 'role', '') not in ('authenticated', 'anon') then
    if new.is_helpful and not old.is_helpful then
      new.helpful_at := coalesce(new.helpful_at, now());
    elsif not new.is_helpful then
      new.helpful_at := null;
    end if;
    return new;
  end if;

  select owner_id into track_owner from public.tracks where id = old.track_id;

  -- For a reply the time follows the parent and is not an edit.
  if (new.body, new.category) is distinct from (old.body, old.category)
    or (old.parent_id is null and new.time_ms is distinct from old.time_ms)
  then
    if uid is distinct from old.author_id then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only the author can edit a comment.';
    end if;
    new.body := btrim(new.body);
    if new.time_ms is not null
      and new.time_ms > (select duration_ms from public.track_versions where id = old.version_id)
    then
      raise exception 'time_out_of_range' using errcode = '22023';
    end if;
    new.edited_at := now();
    body_changed := new.body is distinct from old.body;
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

  -- A new text has not been judged Helpful yet.
  if body_changed and old.is_helpful then
    new.is_helpful := false;
    new.helpful_at := null;
  end if;

  if new.resolved_at is distinct from old.resolved_at then
    if uid is distinct from track_owner then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only the track owner can resolve a comment.';
    end if;
    if old.parent_id is not null then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only top level comments can be resolved.';
    end if;
    new.resolved_at := case when new.resolved_at is not null then now() end;
  end if;

  return new;
end;
$$;

-- Reservations for a version ---------------------------------------------

-- reserve_upload(p_track) reserves an upload for a new version of the
-- caller's live track. Within 24 hours of the previous version the upload
-- limit does not apply; the attempts limit (three per allowed upload a day)
-- always does.
drop function public.reserve_upload();

create function public.reserve_upload(p_track uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  helpful integer;
  banned timestamptz;
  lim public.reputation_levels;
  used_day integer;
  free_version boolean := false;
  reserved uuid := gen_random_uuid();
begin
  if uid is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select reputation, banned_at into helpful, banned from public.profiles where id = uid;
  if banned is not null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_track is not null then
    if not exists (
      select 1 from public.tracks where id = p_track and owner_id = uid and status = 'live'
    ) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if (select max(version_no) from public.track_versions where track_id = p_track) >= 10 then
      raise exception 'version_limit' using errcode = '22023',
        detail = 'A track can have at most 10 versions.';
    end if;
    free_version := (
      select max(created_at) from public.track_versions where track_id = p_track
    ) > now() - interval '24 hours';
  end if;

  if not free_version and public.track_upload_allowance() < 1 then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'tracks_per_day',
        hint = 'You have reached your upload limit for now.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('upload:' || uid::text, 0));

  lim := public.reputation_level(coalesce(helpful, 0));

  select count(*) into used_day
  from private.rate_limit_events
  where user_id = uid and action = 'upload' and created_at > now() - interval '1 day';

  if used_day >= lim.tracks_per_day * 3 then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'uploads_per_day',
        hint = 'Too many upload attempts today.';
  end if;

  insert into private.rate_limit_events (user_id, action) values (uid, 'upload');
  insert into private.upload_reservations (object_id, user_id) values (reserved, uid);
  return reserved;
end;
$$;

-- Storage: files of any version of a visible track are readable --------

drop policy "Audio of visible tracks is readable" on storage.objects;
drop policy "Peaks of visible tracks are readable" on storage.objects;

create policy "Audio of visible tracks is readable" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'audio'
    and exists (select 1 from public.track_versions v where v.audio_key = objects.name)
  );

create policy "Peaks of visible tracks are readable" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'peaks'
    and exists (select 1 from public.track_versions v where v.peaks_key = objects.name)
  );

-- Cleanup: files used by any version stay -------------------------------

create or replace function public.orphaned_upload_objects(p_limit integer default 100)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.created_at < now() - interval '3 hours'
    and (
      (
        o.bucket_id in ('audio', 'peaks')
        and not exists (
          select 1 from public.track_versions v
          where v.audio_key = o.name or v.peaks_key = o.name
        )
        and not exists (
          select 1 from public.tracks t
          where t.audio_key = o.name or t.peaks_key = o.name
        )
        and not exists (
          select 1 from private.upload_reservations r
          where r.expires_at > now()
            and o.name like r.user_id::text || '/' || r.object_id::text || '.%'
        )
      )
      or (
        o.bucket_id = 'avatars'
        and not exists (select 1 from public.profiles p where p.avatar_key = o.name)
      )
    )
  order by o.created_at
  limit least(greatest(p_limit, 1), 500);
$$;

revoke execute on function private.tracks_create_first_version() from public, anon, authenticated;
revoke execute on function private.track_versions_before_insert() from public, anon, authenticated;
revoke execute on function private.track_versions_mirror() from public, anon, authenticated;
revoke execute on function private.comments_before_insert() from public, anon, authenticated;
revoke execute on function private.comments_before_update() from public, anon, authenticated;
revoke execute on function public.reserve_upload(uuid) from public, anon;
grant execute on function public.reserve_upload(uuid) to authenticated;
revoke execute on function public.orphaned_upload_objects(integer) from public, anon, authenticated;
grant execute on function public.orphaned_upload_objects(integer) to service_role;
