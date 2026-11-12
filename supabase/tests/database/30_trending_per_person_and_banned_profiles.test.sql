-- Trending counts each person once per track, and a banned person cannot
-- rename their profile.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
\ir _helpers.psql

-- Trending --------------------------------------------------------------------
-- Two tracks published at the same moment by the same person. One gets
-- twelve comments from one account, the other one comment each from two.
create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'live', 'jazz') as flooded,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'live', 'jazz') as heard;
grant select on ids to anon;
update public.tracks set published_at = now() - interval '1 hour'
where id in (select flooded from ids union all select heard from ids);

select set_config('needears.seeding', 'on', true);
insert into public.comments (track_id, author_id, body)
select flooded, '22222222-2222-4222-8222-222222222222', 'Comment ' || n
from ids, generate_series(1, 12) as n;
insert into public.comments (track_id, author_id, body)
select heard, author, 'Comment' from ids,
  unnest(array['33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444']::uuid[]) as author;
select set_config('needears.seeding', 'off', true);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is(
  (select array_agg(f.id) from public.feed_trending('jazz') f
   where f.id in (select flooded from ids union all select heard from ids)),
  (select array[heard, flooded] from ids),
  'two people commenting outrank one person commenting twelve times'
);
select ok(
  exists (select 1 from public.feed_trending('jazz') f join ids on f.id = ids.flooded),
  'a track with one commenter is still trending'
);
reset role;

-- Banned profiles -------------------------------------------------------------
update public.profiles
set banned_at = now(), avatar_url = 'https://lh3.googleusercontent.com/a/bob'
where handle = 'bob';
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ update public.profiles set display_name = 'Need Ears Team' where id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', 'not_allowed', 'banned users cannot change their display name'
);
select throws_ok(
  $$ update public.profiles set bio = 'Spam' where id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', 'not_allowed', 'banned users cannot change their bio'
);
select throws_ok(
  $$ update public.profiles set handle = 'needears_team' where id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', 'not_allowed', 'banned users cannot change their username'
);
select throws_ok(
  $$ update public.profiles set avatar_url = 'https://lh3.googleusercontent.com/a/other' where id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', 'not_allowed', 'banned users cannot point their picture somewhere else'
);
select lives_ok(
  $$ update public.profiles set avatar_url = null where id = '22222222-2222-4222-8222-222222222222' $$,
  'banned users can still remove the picture from Google'
);
reset role;

-- Someone who is not banned still can.
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ update public.profiles set display_name = 'Carol C', bio = 'Hi' where id = '33333333-3333-4333-8333-333333333333' $$,
  'others can still change their name and bio'
);
reset role;

select * from finish();
rollback;
