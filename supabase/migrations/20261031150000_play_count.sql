-- Plays. tracks.play_count goes up by one when someone has listened to a
-- track for 30 seconds. The browser asks once per session through
-- /api/tracks/[id]/play, which calls record_play with the service role, so
-- nobody can write the count directly.
--
-- A listener is the signed in user ("u:<id>") or a hash of the IP address
-- ("ip:<sha256>"). The events only live for two days: long enough to count
-- one play per listener and track per hour and to cap scripts, and purged
-- with the other short lived data.

create table private.play_events (
  track_id uuid not null references public.tracks (id) on delete cascade,
  listener text not null check (char_length(listener) between 3 and 80),
  created_at timestamptz not null default now()
);

create index play_events_listener_idx
  on private.play_events (listener, created_at desc);

alter table private.play_events enable row level security;

-- Returns true when the play was counted, false when it was not (the owner
-- listening back, or the same listener again within the hour). Raises
-- not_found for a track that is missing or not live, and rate_limited after
-- 120 plays an hour from one listener.
create function public.record_play(p_track uuid, p_listener text, p_user uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  track_owner uuid;
  recent integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('play:' || p_listener, 0));

  select owner_id into track_owner
  from public.tracks
  where id = p_track and status = 'live';
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  if p_user is not null and p_user = track_owner then
    return false;
  end if;

  if exists (
    select 1 from private.play_events
    where listener = p_listener
      and track_id = p_track
      and created_at > now() - interval '1 hour'
  ) then
    return false;
  end if;

  select count(*) into recent
  from private.play_events
  where listener = p_listener
    and created_at > now() - interval '1 hour';
  if recent >= 120 then
    raise exception 'rate_limited'
      using errcode = 'PT429', hint = 'Too many plays from here. Try again in an hour.';
  end if;

  insert into private.play_events (track_id, listener) values (p_track, p_listener);
  update public.tracks set play_count = play_count + 1 where id = p_track;
  return true;
end;
$$;

revoke execute on function public.record_play(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_play(uuid, text, uuid) to service_role;

create or replace function private.purge_expired_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.track_upload_ips where created_at < now() - interval '30 days';
  delete from private.rate_limit_events where created_at < now() - interval '8 days';
  delete from private.play_events where created_at < now() - interval '2 days';
$$;
