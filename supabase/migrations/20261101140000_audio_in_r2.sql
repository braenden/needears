-- Audio moves from Supabase Storage to Cloudflare R2.
--
-- Peaks and avatars stay in Storage, and audio keys keep their format
-- (`<user id>/<uuid>.mp3`). The database cannot see R2, so the checks that
-- used storage.objects for audio now work from the upload reservation:
--
-- 1. /api/upload/sign reserves the object id (reserve_upload, unchanged) and
--    presigns a PUT for exactly that key, size and type.
-- 2. /api/tracks and /api/tracks/[id]/versions check the object in R2
--    (size, type, mp3 frames, duration) and then mark the reservation as
--    verified with mark_upload_verified, which only the service role may
--    call. A rejected upload's reservation is dropped with discard_upload
--    before its files are removed.
-- 3. A track or version may only use an audio key whose reservation belongs
--    to the owner, is still valid and was verified. The peaks check against
--    Storage stays as it was.
--
-- Who may play what is decided by the app: it only presigns audio keys the
-- visitor can see in track_versions with their own client, which follows
-- the same rules as the old Storage policy.
--
-- The old audio bucket and its read policy stay until the files have been
-- copied to R2. Nobody may upload new audio to it.

alter table private.upload_reservations add column audio_verified_at timestamptz;

-- Marks the audio of a reservation as checked in R2. False when the
-- reservation is gone, expired or belongs to someone else.
create function public.mark_upload_verified(p_user uuid, p_object uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.upload_reservations
  set audio_verified_at = now()
  where object_id = p_object
    and user_id = p_user
    and expires_at > now();
  return found;
end;
$$;

-- True when `p_audio_key` is `<owner>/<reserved id>.mp3` of a valid
-- reservation of the owner whose audio was verified. Locks the reservation
-- until the insert commits, so discard_upload cannot remove it (and its
-- files) under a track that is being created, and a discarded one is never
-- used.
create function private.audio_upload_verified(p_owner uuid, p_audio_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform 1
  from private.upload_reservations r
  where r.user_id = p_owner
    and r.expires_at > now()
    and r.audio_verified_at is not null
    and p_audio_key = r.user_id::text || '/' || r.object_id::text || '.mp3'
  for update;
  return found;
end;
$$;

-- Drops a reservation whose upload was rejected, before its files are
-- removed. False when it is already gone (used by a track, or expired),
-- and then the files must stay: the cleanup cron decides about them.
create function public.discard_upload(p_user uuid, p_object uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from private.upload_reservations
  where object_id = p_object and user_id = p_user;
  return found;
end;
$$;

create or replace function private.tracks_before_insert()
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

  -- The audio in R2 must have been reserved by the owner and verified, and
  -- the peaks object must exist in the owner's folder and belong to the
  -- owner. The key format is checked by table constraints.
  if not private.audio_upload_verified(new.owner_id, new.audio_key) then
    raise exception 'audio_not_verified' using errcode = '22023';
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

create or replace function private.track_versions_before_insert()
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

  -- Not while reported: the admin must hear what was reported.
  if track.status <> 'live'
    or exists (select 1 from public.profiles where id = track.owner_id and banned_at is not null)
    or public.track_under_review(track.id)
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

  if not private.audio_upload_verified(track.owner_id, new.audio_key) then
    raise exception 'audio_not_verified' using errcode = '22023';
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

  -- Free only within 24 hours of the track's first version, so the window
  -- cannot be chained from version to version.
  if track.created_at < now() - interval '24 hours' then
    perform private.consume_rate_limit(track.owner_id, 'track');
  end if;

  return new;
end;
$$;

-- Of the given audio keys in R2, the ones nothing uses: no track or version
-- refers to them and no valid reservation covers them. For
-- /api/cron/cleanup-uploads (service role only), which only passes keys of
-- objects older than three hours, so an upload in progress is never among
-- them.
create function public.unused_audio_keys(p_keys text[])
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select k.key
  from unnest(p_keys[1:1000]) as k (key)
  where k.key is not null
    and not exists (select 1 from public.track_versions v where v.audio_key = k.key)
    and not exists (select 1 from public.tracks t where t.audio_key = k.key)
    and not exists (
      select 1 from private.upload_reservations r
      where r.expires_at > now()
        and k.key = r.user_id::text || '/' || r.object_id::text || '.mp3'
    );
$$;

-- New audio goes to R2 only.
drop policy "Users upload reserved audio" on storage.objects;

revoke execute on function public.mark_upload_verified(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.audio_upload_verified(uuid, text) from public, anon, authenticated;
revoke execute on function private.tracks_before_insert() from public, anon, authenticated;
revoke execute on function private.track_versions_before_insert() from public, anon, authenticated;
revoke execute on function public.unused_audio_keys(text[]) from public, anon, authenticated;
revoke execute on function public.discard_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_upload_verified(uuid, uuid) to service_role;
grant execute on function public.unused_audio_keys(text[]) to service_role;
grant execute on function public.discard_upload(uuid, uuid) to service_role;
