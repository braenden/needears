-- Reports, auto hide after three reports, admin moderation and bans.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
\ir _helpers.psql

-- Three fresh accounts, younger than a day.
select pg_temp.make_user('88888888-8888-4888-8888-000000000001', 'fresh1', interval '1 hour');
select pg_temp.make_user('88888888-8888-4888-8888-000000000002', 'fresh2', interval '1 hour');
select pg_temp.make_user('88888888-8888-4888-8888-000000000003', 'fresh3', interval '1 hour');

create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as track,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as other_track;
grant select on ids to anon, authenticated;

create function pg_temp.report_as(p_user uuid, p_track uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.reports (target_type, track_id, reason) values ('track', p_track, 'spam');
  reset role;
end;
$$;

-- Auto hide -----------------------------------------------------------------
-- Reports count only from accounts with some standing (trust rules).
update public.profiles set reputation = 1 where handle in ('bob', 'carol', 'dave', 'fresh1', 'fresh2', 'fresh3');
select pg_temp.report_as('22222222-2222-4222-8222-222222222222', (select track from ids));
select throws_ok(
  $$ select pg_temp.report_as('22222222-2222-4222-8222-222222222222', (select track from ids)) $$,
  '23505', null, 'a user can only report the same track once'
);
select pg_temp.report_as('33333333-3333-4333-8333-333333333333', (select track from ids));
select is((select status from public.tracks where id = (select track from ids)), 'live', 'two reports do not hide a track');
select pg_temp.report_as('44444444-4444-4444-8444-444444444444', (select track from ids));
select is((select status from public.tracks where id = (select track from ids)), 'hidden', 'three reports from different users hide a track');

select pg_temp.report_as('88888888-8888-4888-8888-000000000001', (select other_track from ids));
select pg_temp.report_as('88888888-8888-4888-8888-000000000002', (select other_track from ids));
select pg_temp.report_as('88888888-8888-4888-8888-000000000003', (select other_track from ids));
select is(
  (select status from public.tracks where id = (select other_track from ids)),
  'live',
  'reports from accounts younger than a week do not trigger auto hide'
);

-- Reports are private -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.reports), 1, 'users only see their own reports');
select throws_ok(
  $$ update public.reports set status = 'dismissed' $$,
  '42501', null, 'users cannot change report status'
);
select throws_ok(
  $$ insert into public.reports (target_type, track_id, reason) values ('track', (select track from ids), 'spam') $$,
  '42501', null, 'users cannot report a track they cannot see'
);
select throws_ok(
  $$ select public.admin_set_track_status((select other_track from ids), 'hidden') $$,
  '42501', 'not_allowed', 'non admins cannot hide tracks'
);
select throws_ok(
  $$ select public.admin_set_banned('11111111-1111-4111-8111-111111111111', true) $$,
  '42501', 'not_allowed', 'non admins cannot ban users'
);
reset role;

-- Report rate limit (lowered for the test, rolled back afterwards) ----------
-- fresh1 has already sent one report today.
update public.reputation_levels set reports_per_day = 1 where id = 'new_ear';
select throws_ok(
  $$ select pg_temp.report_as('88888888-8888-4888-8888-000000000001', pg_temp.make_track('22222222-2222-4222-8222-222222222222')) $$,
  'PT429', 'rate_limited', 'reports are rate limited'
);

-- Admin ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select ok((select count(*) from public.reports) >= 6, 'admins see all reports');
select is((select count(*)::int from public.tracks where id = (select track from ids)), 1, 'admins see hidden tracks');
select lives_ok(
  $$ select public.admin_set_track_status((select other_track from ids), 'hidden') $$,
  'admins can hide a track'
);
select lives_ok(
  $$ select public.admin_resolve_report(
       (select id from public.reports where reporter_id = '22222222-2222-4222-8222-222222222222'), 'resolved') $$,
  'admins can resolve a report'
);
reset role;

select is((select status from public.tracks where id = (select other_track from ids)), 'hidden', 'the admin hid the track');
select is(
  (select resolved_by from public.reports where reporter_id = '22222222-2222-4222-8222-222222222222'),
  '44444444-4444-4444-8444-444444444444'::uuid,
  'resolving a report records who did it'
);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is((select count(*)::int from public.tracks where id = (select other_track from ids)), 0, 'hidden tracks disappear for everyone else');
reset role;

-- Shadow ban ----------------------------------------------------------------
create temp table bob_track as select pg_temp.make_track('22222222-2222-4222-8222-222222222222') as id;
grant select on bob_track to anon, authenticated;
insert into public.comments (track_id, author_id, body)
values (pg_temp.make_track('33333333-3333-4333-8333-333333333333'), '22222222-2222-4222-8222-222222222222', 'Before the ban');

select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select public.admin_set_banned('22222222-2222-4222-8222-222222222222', true);
reset role;

select is(
  (select array_agg(distinct status::text) from public.comments where author_id = '22222222-2222-4222-8222-222222222222'),
  array['hidden'],
  'banning hides existing comments'
);
select is((select status from public.tracks where id = (select id from bob_track)), 'hidden', 'banning hides existing tracks');

create temp table carol_track as select pg_temp.make_track('33333333-3333-4333-8333-333333333333') as id;
grant select on carol_track to anon, authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
insert into public.comments (track_id, body) values ((select id from carol_track), 'After the ban');
select is(
  (select status::text from public.comments where body = 'After the ban'),
  'hidden',
  'new comments from a banned user are hidden, but the user still sees them'
);
reset role;

select * from finish();
rollback;
