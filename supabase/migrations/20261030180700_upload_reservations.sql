-- Upload reservations.
--
-- Without this, any signed in user could write objects straight to their
-- own folder in the public buckets with the Storage API, skipping
-- /api/upload/sign, and use the buckets as free file hosting. Now every
-- object needs a reservation that only /api/upload/sign creates (through
-- reserve_upload, which is rate limited), and reservations expire after
-- two hours, the lifetime of a signed upload URL. Objects whose reservation
-- expired without a track are removed by /api/cron/cleanup-uploads.

create table private.upload_reservations (
  object_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '2 hours',
  created_at timestamptz not null default now()
);

create index upload_reservations_expires_at_idx on private.upload_reservations (expires_at);
create index upload_reservations_user_id_idx on private.upload_reservations (user_id);

alter table private.upload_reservations enable row level security;

alter table private.rate_limit_events drop constraint rate_limit_events_action_check;
alter table private.rate_limit_events add constraint rate_limit_events_action_check
  check (action in ('track', 'comment', 'report', 'upload'));

-- Reserves an object id for the calling user. Refuses when the user has no
-- uploads left, and allows three reservations per allowed upload a day, so
-- a failed upload can be retried but reservations cannot be farmed.
create function public.reserve_upload()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  helpful integer;
  lim public.reputation_levels;
  used_day integer;
  reserved uuid := gen_random_uuid();
begin
  if uid is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if public.track_upload_allowance() < 1 then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'tracks_per_day',
        hint = 'You have reached your upload limit for now.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('upload:' || uid::text, 0));

  select reputation into helpful from public.profiles where id = uid;
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

-- Used by the storage insert policies. True when `name` is
-- `<caller>/<reserved id><extension>` and the reservation is still valid.
create function public.can_upload_object(p_name text, p_extension text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.upload_reservations r
    where r.user_id = (select auth.uid())
      and r.expires_at > now()
      and p_name = r.user_id::text || '/' || r.object_id::text || p_extension
  );
$$;

-- A track uses up its reservation.
create function private.tracks_use_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.upload_reservations
  where object_id::text = split_part(split_part(new.audio_key, '/', 2), '.', 1);
  return null;
end;
$$;

create trigger tracks_use_reservation
  after insert on public.tracks
  for each row execute function private.tracks_use_reservation();

-- For the cleanup route (service role only): expired reservations, and a
-- way to forget them once their objects are gone.
create function public.expired_upload_reservations(p_limit integer default 200)
returns table (object_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.object_id, r.user_id
  from private.upload_reservations r
  where r.expires_at < now()
  order by r.expires_at
  limit least(greatest(p_limit, 1), 1000);
$$;

create function public.forget_upload_reservations(p_object_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.upload_reservations where object_id = any (p_object_ids);
$$;

drop policy "Users upload audio to their own folder" on storage.objects;
drop policy "Users upload peaks to their own folder" on storage.objects;

create policy "Users upload reserved audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio' and public.can_upload_object(name, '.mp3'));

create policy "Users upload reserved peaks" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'peaks' and public.can_upload_object(name, '.json'));

revoke execute on function private.tracks_use_reservation() from public, anon, authenticated;
revoke execute on function public.reserve_upload() from public, anon;
revoke execute on function public.can_upload_object(text, text) from public, anon;
revoke execute on function public.expired_upload_reservations(integer) from public, anon, authenticated;
revoke execute on function public.forget_upload_reservations(uuid[]) from public, anon, authenticated;
grant execute on function public.reserve_upload() to authenticated;
grant execute on function public.can_upload_object(text, text) to authenticated;
grant execute on function public.expired_upload_reservations(integer) to service_role;
grant execute on function public.forget_upload_reservations(uuid[]) to service_role;

-- Owners may no longer delete track rows directly: a direct delete would
-- leave the public audio file behind, and moderated (hidden or taken down)
-- tracks must stay as a record. DELETE /api/tracks/[id] does it with the
-- service role and removes the objects too.
drop policy "Owners and admins delete tracks" on public.tracks;
revoke delete on public.tracks from authenticated;
