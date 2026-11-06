-- Search ranks exact and word start matches first and leaves fuzzy ones out
-- when there are better ones. Nobody posts before choosing a username.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
\ir _helpers.psql

-- Search ------------------------------------------------------------------
update public.profiles set handle = 'zelda', display_name = 'Zelda Moss' where handle = 'alice';
update public.profiles set handle = 'marlowe', display_name = 'Marlowe Berg' where handle = 'bob';
create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as nora_track,
  pg_temp.make_track('22222222-2222-4222-8222-222222222222') as jonas_track,
  pg_temp.make_track('33333333-3333-4333-8333-333333333333') as noise_track;
grant select on ids to anon, authenticated, service_role;
update public.tracks set title = 'Quiet harbour' where id = (select nora_track from ids);
update public.tracks set title = 'Brygge beat' where id = (select jonas_track from ids);
update public.tracks set title = 'Dusty reel', tags = array['zeldo', 'reelish'] where id = (select noise_track from ids);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select results_eq(
  $$ select kind, handle from public.search('zelda') $$,
  $$ values ('profile', 'zelda'), ('track', 'zelda') $$,
  'an artist''s name finds the artist first, then their tracks, and not a track with a similar tag'
);
select ok(
  exists (select 1 from public.search('marolwe') s join ids on s.id = ids.jonas_track),
  'a typo still finds the artist''s tracks when nothing matches better'
);
select is(
  (select handle from public.search('marolwe') where kind = 'profile'),
  'marlowe',
  'and the artist'
);
select is(
  (select id from public.search('quiet harbour') limit 1),
  (select nora_track from ids),
  'a title search puts that track first'
);
select ok(
  exists (select 1 from public.search('reelish') s join ids on s.id = ids.noise_track),
  'a tag matches as a whole word'
);
reset role;

-- No posting before a username ----------------------------------------------
select pg_temp.make_user('55555555-5555-4555-8555-555555555555', 'eve');
update public.profiles set onboarded_at = null where handle = 'eve';

create function pg_temp.as_eve()
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    '{"sub": "55555555-5555-4555-8555-555555555555", "role": "authenticated"}', true);
$$;

select pg_temp.as_eve();
set local role authenticated;
select throws_ok(
  $$ insert into public.comments (track_id, body) select nora_track, 'Hi' from ids $$,
  '42501', 'handle_required', 'no comment before a username'
);
select throws_ok(
  $$ insert into public.reactions (track_id, kind) select nora_track, 'fire' from ids $$,
  '42501', 'handle_required', 'no reaction before a username'
);
select throws_ok(
  'select public.reserve_upload()',
  '42501', 'handle_required', 'no upload before a username'
);
select lives_ok(
  $$ insert into public.reports (target_type, track_id, reason)
     select 'track', nora_track, 'spam' from ids $$,
  'reporting abuse is always possible'
);
select throws_ok(
  $$ update public.profiles set onboarded_at = now() where handle = 'eve' $$,
  '42501', null, 'nobody sets the flag directly'
);
reset role;
select ok(
  (select onboarded_at is null from public.profiles where handle = 'eve'),
  'the flag is still not set'
);
select ok(
  not exists (select 1 from public.search('eve') where kind = 'profile'),
  'a profile without a chosen username is not in search'
);

-- Replies and Helpful, from an account without a username.
insert into public.comments (track_id, author_id, body)
select nora_track, '22222222-2222-4222-8222-222222222222', 'Jonas on Nora' from ids;
select pg_temp.as_eve();
set local role authenticated;
select throws_ok(
  $$ insert into public.comments (track_id, parent_id, body)
     select nora_track, (select id from public.comments where body = 'Jonas on Nora'), 'Reply' from ids $$,
  '42501', 'handle_required', 'no reply before a username'
);
reset role;
select pg_temp.make_objects('11111111-1111-4111-8111-111111111111', 'f2000000-0000-4000-8000-000000000001');
update public.profiles set onboarded_at = null where handle = 'zelda';
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ update public.comments set is_helpful = true where body = 'Jonas on Nora' $$,
  '42501', 'handle_required', 'no Helpful mark before a username'
);
reset role;

-- Tracks and versions, inserted by the server (on a track without reports).
create temp table base as select pg_temp.make_track('11111111-1111-4111-8111-111111111111') as id;
grant select on base to service_role;
update public.tracks set title = 'Version base' where id = (select id from base);
set local role service_role;
select throws_ok(
  $$ insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key)
     values ('11111111-1111-4111-8111-111111111111', 'Too early', 1, 5000,
       '11111111-1111-4111-8111-111111111111/f2000000-0000-4000-8000-000000000001.mp3',
       '11111111-1111-4111-8111-111111111111/f2000000-0000-4000-8000-000000000001.json') $$,
  '42501', 'handle_required', 'no track before a username'
);
select throws_ok(
  $$ insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms)
     select (select id from base), 0,
       '11111111-1111-4111-8111-111111111111/f2000000-0000-4000-8000-000000000001.mp3',
       '11111111-1111-4111-8111-111111111111/f2000000-0000-4000-8000-000000000001.json', 5000
     from ids $$,
  '42501', 'handle_required', 'no new version before a username'
);
reset role;

-- The welcome page saves the handle, and then everything works.
select pg_temp.as_eve();
set local role authenticated;
select lives_ok(
  $$ update public.profiles set handle = 'eve', display_name = 'Eve'
     where id = '55555555-5555-4555-8555-555555555555' $$,
  'saving a username works without one'
);
select lives_ok(
  $$ insert into public.comments (track_id, body) select nora_track, 'Hi now' from ids $$,
  'and then commenting works'
);
reset role;

select * from finish();
rollback;
