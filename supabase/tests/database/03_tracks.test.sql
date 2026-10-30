-- Tracks: visibility, ownership, storage checks and the upload rate limit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
\ir _helpers.psql

create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as live,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'hidden') as hidden,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as spare;
grant select on ids to anon, authenticated;

select alike(
  (select slug from public.tracks where id = (select live from ids)),
  'test-track-%',
  'a slug is generated from the title plus a random id'
);

-- Anon ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is((select count(*)::int from public.tracks where id = (select live from ids)), 1, 'anon sees live tracks');
select is((select count(*)::int from public.tracks where id = (select hidden from ids)), 0, 'anon does not see hidden tracks');
reset role;

-- Bob -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.tracks where id = (select hidden from ids)), 0, 'other users do not see hidden tracks');
update public.tracks set title = 'Pwned' where id = (select live from ids);
select throws_ok(
  $$ delete from public.tracks where id = (select spare from ids) $$,
  '42501', null, 'users cannot delete tracks directly, only through DELETE /api/tracks/[id]'
);
select throws_ok(
  $$ insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key)
     values ('22222222-2222-4222-8222-222222222222', 'x', 1, 5000,
       '22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3',
       '22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.json') $$,
  '42501', null, 'users cannot insert tracks directly, only through /api/tracks'
);
select throws_ok('select * from public.track_upload_ips', '42501', null, 'users cannot read upload IPs');
reset role;

select is((select title from public.tracks where id = (select live from ids)), 'Test track', 'a user cannot edit someone else''s track');
select is((select count(*)::int from public.tracks where id = (select spare from ids)), 1, 'a user cannot delete someone else''s track');

-- Alice ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.tracks where id = (select hidden from ids)), 1, 'owners see their own hidden tracks');
select lives_ok(
  $$ update public.tracks set title = '  New title ', tags = array['Lo Fi', 'lo fi', 'Piano']
     where id = (select live from ids) $$,
  'owners can edit their own tracks'
);
select throws_ok(
  $$ update public.tracks set status = 'live' where id = (select hidden from ids) $$,
  '42501', null, 'owners cannot change the status of their tracks'
);
select throws_ok(
  $$ update public.tracks set audio_key = audio_key where id = (select live from ids) $$,
  '42501', null, 'owners cannot repoint the audio object'
);
select throws_ok(
  $$ update public.tracks set comment_count = 100 where id = (select live from ids) $$,
  '42501', null, 'owners cannot change counters'
);
select throws_ok(
  $$ delete from public.tracks where id = (select spare from ids) $$,
  '42501', null, 'not even their own (the route removes the audio files too)'
);
reset role;

select results_eq(
  $$ select title, tags from public.tracks where id = (select live from ids) $$,
  $$ values ('New title', array['lo fi', 'piano']) $$,
  'titles are trimmed and tags normalized'
);

-- Storage checks and rate limit (as the service role, like /api/tracks) -----
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111');
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'c2222222-2222-4222-8222-222222222222');
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'c3333333-3333-4333-8333-333333333333');
-- An object in carol's folder that bob uploaded.
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'c4444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222');

create function pg_temp.insert_track(p_object text)
returns void
language sql
as $$
  insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key)
  values ('33333333-3333-4333-8333-333333333333', 'Carol', 1, 5000,
    '33333333-3333-4333-8333-333333333333/' || p_object || '.mp3',
    '33333333-3333-4333-8333-333333333333/' || p_object || '.json');
$$;

set local role service_role;
select throws_ok(
  $$ select pg_temp.insert_track('c9999999-9999-4999-8999-999999999999') $$,
  '22023', 'audio_object_missing', 'a track needs an uploaded audio object'
);
select throws_ok(
  $$ select pg_temp.insert_track('c4444444-4444-4444-8444-444444444444') $$,
  '22023', 'audio_object_missing', 'the audio object must belong to the track owner'
);
select lives_ok(
  $$ select pg_temp.insert_track('c1111111-1111-4111-8111-111111111111');
     select pg_temp.insert_track('c2222222-2222-4222-8222-222222222222') $$,
  'a new user can upload two tracks a day'
);
select throws_ok(
  $$ select pg_temp.insert_track('c3333333-3333-4333-8333-333333333333') $$,
  'PT429', 'rate_limited', 'the third upload in a day is rate limited'
);
reset role;

select * from finish();
rollback;
