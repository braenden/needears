-- Moderation notices: owners hear when an admin hides or removes their
-- post, reporters hear when their report is dismissed, admins stay
-- anonymous and bans stay silent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
\ir _helpers.psql

create temp table ids (track uuid, other_track uuid, comment uuid, report uuid);
grant select on ids to authenticated;
insert into ids (track, other_track) values (
  pg_temp.make_track('11111111-1111-4111-8111-111111111111'),
  pg_temp.make_track('11111111-1111-4111-8111-111111111111')
);
insert into public.comments (track_id, author_id, body)
select track, '22222222-2222-4222-8222-222222222222', 'Rude' from ids;
update ids set comment = (select id from public.comments where body = 'Rude');
insert into public.reports (reporter_id, target_type, track_id, reason)
select '33333333-3333-4333-8333-333333333333', 'track', other_track, 'spam' from ids;
update ids set report = (select id from public.reports where reporter_id = '33333333-3333-4333-8333-333333333333');
insert into public.reports (reporter_id, target_type, comment_id, reason)
select '33333333-3333-4333-8333-333333333333', 'comment', comment, 'harassment' from ids;

-- Dave is the admin.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.admin_set_track_status((select track from ids), 'hidden', ' Copyright claim from the label ') $$,
  'admins can hide a track with a reason'
);
select lives_ok(
  $$ select public.admin_set_comment_status((select comment from ids), 'deleted', 'Harassment') $$,
  'admins can remove a comment with a reason'
);
select lives_ok(
  $$ select public.admin_resolve_report((select report from ids), 'dismissed', 'Not spam') $$,
  'admins can dismiss a report with a reason'
);
select lives_ok(
  $$ select public.admin_set_track_status((select other_track from ids), 'hidden') $$,
  'the reason is optional'
);
select throws_ok(
  $$ select public.admin_set_track_status((select other_track from ids), 'deleted', repeat('x', 501)) $$,
  '22023', 'reason_too_long', 'the reason is at most 500 characters'
);
reset role;

select results_eq(
  $$ select target::text, action, reason from public.notifications
     where user_id = '11111111-1111-4111-8111-111111111111' and kind = 'moderation' and track_id = (select track from ids) $$,
  $$ values ('track', 'hidden', 'Copyright claim from the label') $$,
  'the owner gets a moderation notice with the trimmed reason'
);
select results_eq(
  $$ select target::text, action, reason, comment_id = (select comment from ids) from public.notifications
     where user_id = '22222222-2222-4222-8222-222222222222' and kind = 'moderation' $$,
  $$ values ('comment', 'removed', 'Harassment', true) $$,
  'the comment author gets a notice'
);
select results_eq(
  $$ select reason from public.notifications
     where user_id = '33333333-3333-4333-8333-333333333333' and kind = 'moderation' and target = 'track' $$,
  $$ values ('Not spam') $$,
  'the reporter hears that the report was dismissed'
);
select is(
  (select count(*)::int from public.notifications where kind = 'moderation' and actor_id is not null),
  0,
  'notices never name the admin'
);

-- Restoring the comment dismisses its report and tells the reporter.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select public.admin_set_comment_status((select comment from ids), 'live', 'Context makes it fine');
reset role;
select results_eq(
  $$ select reason from public.notifications
     where user_id = '33333333-3333-4333-8333-333333333333' and kind = 'moderation' and target = 'comment' $$,
  $$ values ('Context makes it fine') $$,
  'restoring a post tells its reporters'
);

-- Bans stay silent.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select public.admin_set_banned('22222222-2222-4222-8222-222222222222', true);
reset role;
select is(
  (select count(*)::int from public.notifications
   where user_id = '22222222-2222-4222-8222-222222222222' and kind = 'moderation'),
  1,
  'a ban sends no notice'
);

-- Only the recipient can read them, and nobody else can call the functions.
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.notifications where kind = 'moderation'), 2, 'users see their own notices only');
select throws_ok(
  $$ select public.admin_resolve_report((select report from ids), 'open', 'x') $$,
  '42501', 'not_allowed', 'non admins cannot moderate'
);
reset role;

-- A report that is acted on: the reporter hears so, and the owner of an
-- auto hidden post learns why, once.
create temp table upheld (track uuid, report uuid);
grant select on upheld to authenticated;
insert into upheld (track) values (pg_temp.make_track('33333333-3333-4333-8333-333333333333'));
insert into public.reports (reporter_id, target_type, track_id, reason)
select '11111111-1111-4111-8111-111111111111', 'track', track, 'copyright' from upheld;
update upheld set report = (select id from public.reports where track_id = upheld.track);
-- What auto hide does.
update public.tracks set status = 'hidden' where id = (select track from upheld);

select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select public.admin_resolve_report((select report from upheld), 'resolved', '
  Confirmed with the rights holder 
');
select public.admin_resolve_report((select report from upheld), 'open');
select public.admin_resolve_report((select report from upheld), 'resolved', 'Again');
reset role;

select results_eq(
  $$ select action, reason from public.notifications
     where user_id = '11111111-1111-4111-8111-111111111111' and track_id = (select track from upheld)
     order by reason $$,
  $$ values ('report_upheld', 'Again'), ('report_upheld', 'Confirmed with the rights holder') $$,
  'the reporter hears that the report was acted on'
);
select results_eq(
  $$ select action from public.notifications
     where user_id = '33333333-3333-4333-8333-333333333333' and track_id = (select track from upheld) $$,
  $$ values ('hidden') $$,
  'the owner of the hidden post gets one notice'
);

select hasnt_function('public', 'admin_set_track_status', array['uuid', 'track_status'], 'the old signature is gone');
select hasnt_function('public', 'admin_resolve_report', array['uuid', 'report_status'], 'the old report signature is gone');

select * from finish();
rollback;
