-- admin_stats(): only admins can read it, and the north star counts a
-- track once its 48 hours are over, only for comments from someone else.
-- The local database holds the seed too, so the checks compare the numbers
-- before and after the fixtures below.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
\ir _helpers.psql

select ok(not has_function_privilege('anon', 'public.admin_stats()', 'execute'),
  'anon cannot call admin_stats');
select ok(has_function_privilege('authenticated', 'public.admin_stats()', 'execute'),
  'signed in users can call it (the function checks for admin)');

select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok('select * from public.admin_stats()', '42501', 'not_allowed',
  'a regular user is refused');
reset role;

select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
create temp table before_stats as select * from public.admin_stats();
reset role;

-- Alice uploads. Bob and Alice comment.
create temp table t (name text, id uuid, age interval);
insert into t values
  ('hit', pg_temp.make_track('11111111-1111-4111-8111-111111111111'), interval '3 days'),
  ('late', pg_temp.make_track('11111111-1111-4111-8111-111111111111'), interval '5 days'),
  ('own', pg_temp.make_track('11111111-1111-4111-8111-111111111111'), interval '3 days'),
  ('hidden', pg_temp.make_track('11111111-1111-4111-8111-111111111111'), interval '3 days'),
  ('old', pg_temp.make_track('11111111-1111-4111-8111-111111111111'), interval '40 days'),
  ('young', pg_temp.make_track('11111111-1111-4111-8111-111111111111'), interval '0'),
  ('young_heard', pg_temp.make_track('11111111-1111-4111-8111-111111111111'), interval '0');
update public.tracks set created_at = now() - t.age from t where tracks.id = t.id;

select set_config('needears.seeding', 'on', true);
insert into public.comments (track_id, author_id, body, created_at)
select t.id, c.author::uuid, 'note', tr.created_at + c.after
from (values
  ('hit', '22222222-2222-4222-8222-222222222222', interval '1 hour'),
  ('late', '22222222-2222-4222-8222-222222222222', interval '50 hours'),
  ('own', '11111111-1111-4111-8111-111111111111', interval '1 hour'),
  ('hidden', '22222222-2222-4222-8222-222222222222', interval '1 hour'),
  ('old', '22222222-2222-4222-8222-222222222222', interval '1 hour'),
  ('young_heard', '22222222-2222-4222-8222-222222222222', interval '0')
) as c (name, author, after)
join t using (name)
join public.tracks tr on tr.id = t.id;
select set_config('needears.seeding', 'off', true);
update public.tracks set status = 'hidden' where id = (select id from t where name = 'hidden');

set local role authenticated;
create temp table after_stats as select * from public.admin_stats();
reset role;

select is((select a.north_star_all_tracks - b.north_star_all_tracks from after_stats a, before_stats b), 4,
  'tracks past their 48 hours count, hidden tracks and young tracks do not');
select is((select a.north_star_all_hits - b.north_star_all_hits from after_stats a, before_stats b), 2,
  'a comment from someone else within 48 hours is a hit; late and own comments are not');
select is((select a.north_star_30d_tracks - b.north_star_30d_tracks from after_stats a, before_stats b), 3,
  'the 30 day window leaves out the 40 day old track');
select is((select a.north_star_30d_hits - b.north_star_30d_hits from after_stats a, before_stats b), 1,
  'one hit in the last 30 days');
select is((select a.waiting_tracks - b.waiting_tracks from after_stats a, before_stats b), 1,
  'a young track without a comment from someone else is waiting');
select is((select a.tracks_today - b.tracks_today from after_stats a, before_stats b), 2,
  'uploads today');
select is((select a.comments_today - b.comments_today from after_stats a, before_stats b), 1,
  'comments today');
select is((select a.live_tracks - b.live_tracks from after_stats a, before_stats b), 6,
  'live tracks');
select is((select a.live_comments - b.live_comments from after_stats a, before_stats b), 6,
  'live comments (the comment on the hidden track stays live)');
select is((select a.users_total - b.users_total from after_stats a, before_stats b), 0,
  'no new users in the fixtures');

select * from finish();
rollback;
