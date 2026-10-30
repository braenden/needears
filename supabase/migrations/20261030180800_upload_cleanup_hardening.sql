-- Hardening of the upload cleanup.
--
-- 1. A signed upload URL is a stateless token that works for two hours,
--    even after its reservation is gone (used by a track that was then
--    deleted, or removed with the account). Cleanup therefore works from
--    the objects in Storage, not from the reservations: any object older
--    than three hours that no track uses and no valid reservation covers
--    is removed.
-- 2. A track needs a valid reservation, so cleanup can never remove the
--    files of a track created at the same moment.
-- 3. Banned users cannot reserve uploads.

create or replace function public.reserve_upload()
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
  reserved uuid := gen_random_uuid();
begin
  if uid is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select reputation, banned_at into helpful, banned from public.profiles where id = uid;
  if banned is not null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if public.track_upload_allowance() < 1 then
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

-- A track uses up a valid reservation of its owner, or fails.
create or replace function private.tracks_use_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_seeding() then
    return null;
  end if;

  delete from private.upload_reservations
  where object_id::text = split_part(split_part(new.audio_key, '/', 2), '.', 1)
    and user_id = new.owner_id
    and expires_at > now();

  if not found then
    raise exception 'upload_expired' using errcode = '22023',
      detail = 'Upload the file again.';
  end if;

  return null;
end;
$$;

drop function public.expired_upload_reservations(integer);
drop function public.forget_upload_reservations(uuid[]);

-- Objects in the audio and peaks buckets that nothing uses: older than
-- three hours, not referenced by any track and not covered by a valid
-- reservation. For /api/cron/cleanup-uploads (service role only).
create function public.orphaned_upload_objects(p_limit integer default 100)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('audio', 'peaks')
    and o.created_at < now() - interval '3 hours'
    and not exists (
      select 1 from public.tracks t
      where t.audio_key = o.name or t.peaks_key = o.name
    )
    and not exists (
      select 1 from private.upload_reservations r
      where r.expires_at > now()
        and o.name like r.user_id::text || '/' || r.object_id::text || '.%'
    )
  order by o.created_at
  limit least(greatest(p_limit, 1), 500);
$$;

create function public.forget_expired_upload_reservations()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.upload_reservations where expires_at < now();
$$;

revoke execute on function private.tracks_use_reservation() from public, anon, authenticated;
revoke execute on function public.orphaned_upload_objects(integer) from public, anon, authenticated;
revoke execute on function public.forget_expired_upload_reservations() from public, anon, authenticated;
grant execute on function public.orphaned_upload_objects(integer) to service_role;
grant execute on function public.forget_expired_upload_reservations() to service_role;
