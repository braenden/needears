-- Search: live tracks and profiles of people who are not banned, 2 to 100
-- characters, at most 50 results.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
\ir _helpers.psql

create temp table ids (live uuid, hidden uuid, banned uuid);
grant select on ids to anon;
insert into ids values (
  pg_temp.make_track('11111111-1111-4111-8111-111111111111'),
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'hidden'),
  pg_temp.make_track('22222222-2222-4222-8222-222222222222')
);
update public.tracks set title = 'Zebra crossing', tags = array['ambient', 'field recording'] where id = (select live from ids);
update public.tracks set title = 'Zebra secret' where id = (select hidden from ids);
update public.tracks set title = 'Zebra banned' where id = (select banned from ids);
update public.profiles set display_name = 'Zelda Zebra' where handle = 'carol';
update public.profiles set display_name = 'Zebra Bob', banned_at = now() where handle = 'bob';

set local role anon;
select ok(
  exists (select 1 from public.search('zebra') where kind = 'track' and id = (select live from ids)),
  'live tracks are found by title'
);
select ok(
  exists (select 1 from public.search('zebr crosing') where id = (select live from ids)),
  'a typo still finds the track'
);
select ok(
  exists (select 1 from public.search('field recording') where id = (select live from ids)),
  'tracks are found by tag'
);
select ok(
  not exists (select 1 from public.search('zebra') where id = (select hidden from ids)),
  'hidden tracks are not found'
);
select ok(
  not exists (select 1 from public.search('zebra') where id in ((select banned from ids), '22222222-2222-4222-8222-222222222222')),
  'banned people and their tracks are not found'
);
select ok(
  exists (select 1 from public.search('zelda') where kind = 'profile' and handle = 'carol'),
  'profiles are found by display name'
);
select ok(
  exists (select 1 from public.search('caro') where kind = 'profile' and handle = 'carol'),
  'profiles are found by handle'
);
select is((select count(*)::int from public.search('z')), 0, 'one character finds nothing');
select is((select count(*)::int from public.search(repeat('zebra ', 20))), 0, 'over 100 characters finds nothing');
reset role;

select set_config('needears.seeding', 'on', true);
insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key, slug)
select '33333333-3333-4333-8333-333333333333', 'Zebra ' || g, 1, 5000,
  '33333333-3333-4333-8333-333333333333/e0000000-0000-4000-8000-' || lpad(g::text, 12, '0') || '.mp3',
  '33333333-3333-4333-8333-333333333333/e0000000-0000-4000-8000-' || lpad(g::text, 12, '0') || '.json',
  'zebra-' || g
from generate_series(1, 60) g;
select set_config('needears.seeding', 'off', true);
set local role anon;
select is((select count(*)::int from public.search('zebra', 500)), 50, 'at most 50 results');
reset role;

select * from finish();
rollback;
