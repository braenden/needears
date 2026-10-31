-- Versions of a track: version 1 with the track, later versions through the
-- service role with uploaded files and a reservation, at most 10, the track
-- mirrors the latest, comments belong to a version, and the 24 hour window
-- does not count against the upload limit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);
\ir _helpers.psql

create temp table ids (track uuid, other_track uuid, hidden_track uuid, v1 uuid);
grant select on ids to anon, authenticated, service_role;
insert into ids (track, other_track, hidden_track) values (
  pg_temp.make_track('33333333-3333-4333-8333-333333333333'),
  pg_temp.make_track('22222222-2222-4222-8222-222222222222'),
  pg_temp.make_track('33333333-3333-4333-8333-333333333333', 'hidden')
);
update ids set v1 = (select id from public.track_versions where track_id = ids.track);

select results_eq(
  $$ select v.version_no, v.audio_key = t.audio_key, v.duration_ms from public.track_versions v
     join public.tracks t on t.id = v.track_id where t.id = (select track from ids) $$,
  $$ values (1, true, 60000) $$,
  'version 1 is created with the track'
);

-- A comment on version 1 before version 2 exists.
insert into public.comments (track_id, author_id, time_ms, body)
select track, '22222222-2222-4222-8222-222222222222', 45000, 'On v1' from ids;
select is(
  (select version_id from public.comments where body = 'On v1'),
  (select v1 from ids),
  'a comment belongs to the latest version by default'
);

create function pg_temp.add_version(p_object uuid, p_track uuid default null, p_duration integer default 30000)
returns void
language plpgsql
as $$
begin
  insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms, note)
  values (coalesce(p_track, (select track from ids)), 0,
    '33333333-3333-4333-8333-333333333333/' || p_object || '.mp3',
    '33333333-3333-4333-8333-333333333333/' || p_object || '.json',
    p_duration, '  Shorter intro ');
end;
$$;

select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'e0000000-0000-4000-8000-000000000002');
create temp table events_before as
select count(*) as n from private.rate_limit_events
where user_id = '33333333-3333-4333-8333-333333333333' and action = 'track';

set local role service_role;
select lives_ok(
  $$ select pg_temp.add_version('e0000000-0000-4000-8000-000000000002') $$,
  'the service role adds version 2'
);
reset role;

select results_eq(
  $$ select version_no, note from public.track_versions
     where track_id = (select track from ids) order by version_no desc limit 1 $$,
  $$ values (2, 'Shorter intro') $$,
  'versions are numbered by the database and notes trimmed'
);
select results_eq(
  $$ select audio_key, duration_ms from public.tracks where id = (select track from ids) $$,
  $$ values ('33333333-3333-4333-8333-333333333333/e0000000-0000-4000-8000-000000000002.mp3', 30000) $$,
  'the track mirrors its latest version'
);
select is(
  (select count(*) from private.rate_limit_events
   where user_id = '33333333-3333-4333-8333-333333333333' and action = 'track'),
  (select n from events_before),
  'a version within 24 hours does not count against the upload limit'
);

-- Version 3 more than a day later counts.
update public.track_versions set created_at = now() - interval '25 hours' where track_id = (select track from ids);
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'e0000000-0000-4000-8000-000000000003');
set local role service_role;
select pg_temp.add_version('e0000000-0000-4000-8000-000000000003');
reset role;
select is(
  (select count(*) from private.rate_limit_events
   where user_id = '33333333-3333-4333-8333-333333333333' and action = 'track'),
  (select n + 1 from events_before),
  'a version after 24 hours counts against the upload limit'
);

-- Refusals.
set local role service_role;
select throws_ok(
  $$ select pg_temp.add_version('e0000000-0000-4000-8000-0000000000ff') $$,
  '22023', 'audio_object_missing', 'a version needs uploaded files'
);
reset role;
insert into storage.objects (bucket_id, name, owner_id)
values
  ('audio', '33333333-3333-4333-8333-333333333333/e0000000-0000-4000-8000-0000000000ee.mp3', '33333333-3333-4333-8333-333333333333'),
  ('peaks', '33333333-3333-4333-8333-333333333333/e0000000-0000-4000-8000-0000000000ee.json', '33333333-3333-4333-8333-333333333333');
set local role service_role;
select throws_ok(
  $$ select pg_temp.add_version('e0000000-0000-4000-8000-0000000000ee') $$,
  '22023', 'upload_expired', 'a version needs a valid reservation'
);
select throws_ok(
  $$ select pg_temp.add_version('e0000000-0000-4000-8000-0000000000ee', (select other_track from ids)) $$,
  '22023', 'invalid_key', 'files must be in the track owner''s folder'
);
select throws_ok(
  $$ select pg_temp.add_version('e0000000-0000-4000-8000-0000000000ee', (select hidden_track from ids)) $$,
  '42501', 'not_allowed', 'hidden tracks get no new versions'
);
reset role;

select set_config('needears.seeding', 'on', true);
insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms)
select (select track from ids), 0,
  '33333333-3333-4333-8333-333333333333/' || gen_random_uuid() || '.mp3',
  '33333333-3333-4333-8333-333333333333/' || gen_random_uuid() || '.json', 30000
from generate_series(4, 10);
select set_config('needears.seeding', 'off', true);
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'e0000000-0000-4000-8000-000000000011');
set local role service_role;
select throws_ok(
  $$ select pg_temp.add_version('e0000000-0000-4000-8000-000000000011') $$,
  '22023', 'version_limit', 'at most 10 versions'
);
reset role;

-- Comments and versions.
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into public.comments (track_id, time_ms, body) values ((select track from ids), 45000, 'Too late for v10') $$,
  '22023', 'time_out_of_range', 'the time is checked against the version'
);
select lives_ok(
  $$ insert into public.comments (track_id, version_id, time_ms, body)
     values ((select track from ids), (select v1 from ids), 45000, 'On v1 again') $$,
  'a comment can be given on an older version'
);
select throws_ok(
  $$ insert into public.comments (track_id, version_id, body)
     values ((select other_track from ids), (select v1 from ids), 'Wrong track') $$,
  '22023', 'invalid_version', 'the version must belong to the track'
);
select lives_ok(
  $$ insert into public.comments (track_id, parent_id, body)
     values ((select track from ids), (select id from public.comments where body = 'On v1'), 'Reply') $$,
  'users can reply'
);
select throws_ok(
  $$ insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms)
     values ((select track from ids), 0, 'x', 'y', 5000) $$,
  '42501', null, 'users cannot insert versions directly'
);
reset role;
select is(
  (select version_id from public.comments where body = 'Reply'),
  (select v1 from ids),
  'a reply takes its parent''s version'
);

-- Old versions stay readable, and their files are not orphaned.
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is(
  (select count(*)::int from public.track_versions where track_id = (select track from ids)),
  10,
  'anon sees the versions of a live track'
);
select is(
  (select count(*)::int from public.track_versions where track_id = (select hidden_track from ids)),
  0,
  'and not those of a hidden one'
);
reset role;
update storage.objects set created_at = now() - interval '4 hours' where name like '33333333-%/e0000000-%';
select is(
  (select count(*)::int from public.orphaned_upload_objects(500)
   where name like '33333333-3333-4333-8333-333333333333/e0000000-0000-4000-8000-00000000000%'),
  0,
  'files of any version are kept'
);

-- Reserving an upload for a version within 24 hours works at the limit.
insert into private.rate_limit_events (user_id, action)
select '22222222-2222-4222-8222-222222222222', 'track' from generate_series(1, 2);
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.reserve_upload((select other_track from ids)) $$,
  'a version upload within 24 hours can be reserved at the upload limit'
);
reset role;

select * from finish();
rollback;
