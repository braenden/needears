-- Badges, the weekly list and profile stats.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
\ir _helpers.psql

create temp table ids (track uuid, second uuid);
grant select on ids to anon, authenticated, service_role;
insert into ids values (
  pg_temp.make_track('11111111-1111-4111-8111-111111111111'),
  pg_temp.make_track('11111111-1111-4111-8111-111111111111')
);

-- first_ears ------------------------------------------------------------------
insert into public.comments (track_id, author_id, body)
select track, '11111111-1111-4111-8111-111111111111', 'Owner note' from ids;
insert into public.comments (track_id, author_id, body)
select track, '22222222-2222-4222-8222-222222222222', 'First!' from ids;
insert into public.comments (track_id, author_id, body)
select track, '33333333-3333-4333-8333-333333333333', 'Second' from ids;

select is(
  (select array_agg(user_id::text order by user_id) from public.badges where badge = 'first_ears'
   and user_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')),
  array['22222222-2222-4222-8222-222222222222'],
  'first_ears goes to the first person other than the uploader'
);

-- finisher --------------------------------------------------------------------
select pg_temp.make_objects('11111111-1111-4111-8111-111111111111', 'f0000000-0000-4000-8000-000000000001');
select pg_temp.make_objects('11111111-1111-4111-8111-111111111111', 'f0000000-0000-4000-8000-000000000002');
set local role service_role;
insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms)
select second, 0, '11111111-1111-4111-8111-111111111111/f0000000-0000-4000-8000-000000000001.mp3',
  '11111111-1111-4111-8111-111111111111/f0000000-0000-4000-8000-000000000001.json', 30000 from ids;
reset role;
select is(
  (select count(*)::int from public.badges where user_id = '11111111-1111-4111-8111-111111111111' and badge = 'finisher'),
  0,
  'a new version nobody commented on does not make a finisher'
);
set local role service_role;
insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms)
select track, 0, '11111111-1111-4111-8111-111111111111/f0000000-0000-4000-8000-000000000002.mp3',
  '11111111-1111-4111-8111-111111111111/f0000000-0000-4000-8000-000000000002.json', 30000 from ids;
reset role;
select is(
  (select count(*)::int from public.badges where user_id = '11111111-1111-4111-8111-111111111111' and badge = 'finisher'),
  1,
  'a new version after feedback makes a finisher'
);

-- ten_tracks_helped -----------------------------------------------------------
-- Ten established owners, each marking one of bob's comments Helpful.
create temp table owners as
select gen_random_uuid() as id, g from generate_series(1, 10) g;
select pg_temp.make_user(id, 'owner' || g, interval '30 days') from owners;
create temp table owner_tracks as select id as owner, pg_temp.make_track(id) as track, g from owners;
insert into public.comments (track_id, author_id, body)
select track, '22222222-2222-4222-8222-222222222222', 'Tip ' || g from owner_tracks;

update public.comments set is_helpful = true
where author_id = '22222222-2222-4222-8222-222222222222' and body in (select 'Tip ' || g from owner_tracks where g <= 9);
select is(
  (select count(*)::int from public.badges where user_id = '22222222-2222-4222-8222-222222222222' and badge = 'ten_tracks_helped'),
  0,
  'nine owners are not ten'
);
update public.comments set is_helpful = true
where author_id = '22222222-2222-4222-8222-222222222222' and body = 'Tip 10';
select is(
  (select count(*)::int from public.badges where user_id = '22222222-2222-4222-8222-222222222222' and badge = 'ten_tracks_helped'),
  1,
  'Helpful from ten different owners earns ten_tracks_helped'
);

-- Badges are never taken back.
update public.comments set is_helpful = false where author_id = '22222222-2222-4222-8222-222222222222';
select is(
  (select count(*)::int from public.badges where user_id = '22222222-2222-4222-8222-222222222222' and badge = 'ten_tracks_helped'),
  1,
  'badges are never taken back'
);

-- Marks from a new account do not count toward it. (This marks bob's
-- comment on alice's track too: eleven owners, one of them too new.)
update public.comments set is_helpful = true where author_id = '22222222-2222-4222-8222-222222222222';
update public.profiles set created_at = now() where id in (select id from owners where g = 10);
select is(private.helpful_owner_count('22222222-2222-4222-8222-222222222222'), 10, 'owners younger than the trust rules allow do not count');

-- golden_ear ------------------------------------------------------------------
update public.profiles set reputation = 59 where handle = 'carol';
update public.profiles set reputation = 60 where handle = 'carol';
select is(
  (select count(*)::int from public.badges where user_id = '33333333-3333-4333-8333-333333333333' and badge = 'golden_ear'),
  1,
  'reaching Golden ear earns the badge'
);

select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into public.badges (user_id, badge) values ('22222222-2222-4222-8222-222222222222', 'golden_ear') $$,
  '42501', null, 'nobody can award themselves a badge'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Weekly list -----------------------------------------------------------------
set local role anon;
select is(
  (select helpful from public.weekly_helpful_leaders() where handle = 'bob'),
  10,
  'the weekly list counts Helpful that counts this week'
);
select is(
  (select count(*)::int from public.weekly_helpful_leaders((current_date - 14)::date) where handle = 'bob'),
  0,
  'Helpful from this week is not in an earlier week'
);
select ok((select count(*) from public.weekly_helpful_leaders()) <= 10, 'at most ten people');
reset role;
update public.profiles set banned_at = now() where handle = 'bob';
select is(
  (select count(*)::int from public.weekly_helpful_leaders() where handle = 'bob'),
  0,
  'banned people are not listed'
);
update public.profiles set banned_at = null where handle = 'bob';

-- Profile stats ---------------------------------------------------------------
set local role anon;
select results_eq(
  $$ select comments_given, helpful_received, helpful_share, week_streak
     from public.profile_stats('22222222-2222-4222-8222-222222222222') $$,
  $$ values (11, 10, 0.909::numeric, 1) $$,
  'stats count comments, Helpful that counts (not from the new owner), the share and the week streak'
);
reset role;

-- One owner marking many comments counts at most three times, and turning
-- Helpful off and on again keeps the week it was first given.
insert into public.comments (track_id, author_id, body)
select (select track from owner_tracks where g = 1), '33333333-3333-4333-8333-333333333333', 'Farm ' || i
from generate_series(1, 8) i;
update public.comments set is_helpful = true where body like 'Farm %';
set local role anon;
select is(
  (select helpful from public.weekly_helpful_leaders() where handle = 'carol'),
  3,
  'one owner gives at most three on the weekly list'
);
reset role;
update public.comments set first_helpful_at = now() - interval '30 days' where body like 'Farm %';
update public.comments set is_helpful = false where body like 'Farm %';
update public.comments set is_helpful = true where body like 'Farm %';
set local role anon;
select is(
  (select count(*)::int from public.weekly_helpful_leaders() where handle = 'carol'),
  0,
  'turning Helpful off and on does not move a mark into this week'
);
select is(
  (select count(*)::int from public.weekly_helpful_leaders((current_date + 14)::date)),
  0,
  'future weeks are empty'
);
reset role;

-- Comments on your own track do not keep a streak going.
insert into public.comments (track_id, author_id, body, created_at)
select pg_temp.make_track('44444444-4444-4444-8444-444444444444'), '44444444-4444-4444-8444-444444444444', 'Mine', now();
select is(
  (select week_streak from public.profile_stats('44444444-4444-4444-8444-444444444444')),
  0,
  'comments on your own tracks do not count toward the streak'
);

-- A comment last week and the week before makes a three week streak.
insert into public.comments (track_id, author_id, body, created_at)
select track, '22222222-2222-4222-8222-222222222222', 'Old ' || w, now() - make_interval(weeks => w)
from ids, generate_series(1, 2) w;
update public.comments set created_at = now() - interval '1 week' where body = 'Old 1';
update public.comments set created_at = now() - interval '2 weeks' where body = 'Old 2';
select is(
  (select week_streak from public.profile_stats('22222222-2222-4222-8222-222222222222')),
  3,
  'weeks in a row with a comment'
);
select is(
  (select badges from public.profile_stats('22222222-2222-4222-8222-222222222222')),
  array['first_ears', 'ten_tracks_helped']::public.badge_kind[],
  'stats list the badges'
);

select * from finish();
rollback;
