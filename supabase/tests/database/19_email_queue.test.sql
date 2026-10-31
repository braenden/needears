-- Email queue: filled from notifications for people who want email,
-- emptied by deletes, read and marked only by the service role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
\ir _helpers.psql

create temp table ids (track uuid);
grant select on ids to authenticated, service_role;
insert into ids values (pg_temp.make_track('11111111-1111-4111-8111-111111111111'));

insert into public.comments (track_id, author_id, time_ms, body)
select track, '22222222-2222-4222-8222-222222222222', 5000, 'Kick <b>weak</b>' from ids;

select is(
  (select count(*)::int from public.email_queue where user_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'a comment notification is queued for email'
);

-- Carol turns email off, then gets a comment.
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ update public.profiles set email_notifications = false where id = '33333333-3333-4333-8333-333333333333' $$,
  'users can turn email off'
);
select throws_ok('select * from public.email_queue', '42501', null, 'users cannot read the queue');
reset role;
insert into public.comments (track_id, author_id, body)
select pg_temp.make_track('33333333-3333-4333-8333-333333333333'), '22222222-2222-4222-8222-222222222222', 'Hi carol';
select is(
  (select count(*)::int from public.email_queue where user_id = '33333333-3333-4333-8333-333333333333'),
  0,
  'nothing is queued for someone with email off'
);

-- Moderation notices are not emailed.
insert into public.notifications (user_id, kind, action, target, track_id)
select '11111111-1111-4111-8111-111111111111', 'moderation', 'hidden', 'track', track from ids;
select is(
  (select count(*)::int from public.email_queue where user_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'moderation notices are not queued'
);

-- The batch, as the cron route reads it.
set local role service_role;
create temp table got as
select * from public.email_batch(20, 60) where user_id = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$ select email, total, jsonb_array_length(items), items -> 0 ->> 'actor', items -> 0 ? 'excerpt'
     from got $$,
  $$ values ('alice@test.local', 1, 1, 'bob', false) $$,
  'the batch has the address and what happened, without comment text'
);
select is(
  (select count(*)::int from public.email_batch(20, 60) where user_id = '11111111-1111-4111-8111-111111111111'),
  0,
  'claimed rows are not handed out twice'
);
select public.mark_emails_sent(queue_ids) from got;
update public.email_queue set claimed_at = null;
select is(
  (select count(*)::int from public.email_batch(20, 60) where user_id = '11111111-1111-4111-8111-111111111111'),
  0,
  'sent rows are not sent again'
);
reset role;

-- A hidden comment is not emailed, and a deleted one leaves nothing behind.
insert into public.comments (track_id, author_id, body)
select track, '44444444-4444-4444-8444-444444444444', 'Second' from ids;
insert into public.comments (track_id, author_id, body)
select track, '44444444-4444-4444-8444-444444444444', 'Third' from ids;
update public.comments set status = 'hidden' where body = 'Second';
delete from public.comments where body = 'Third';
select is(
  (select count(*)::int from public.email_queue q join public.notifications n on n.id = q.notification_id
   where q.sent_at is null and q.user_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'deleting a comment removes its queued email'
);
set local role service_role;
select is(
  (select count(*)::int from public.email_batch(20, 60) where user_id = '11111111-1111-4111-8111-111111111111'),
  0,
  'a comment that was hidden is not emailed'
);
reset role;

-- The daily budget: with 61 emails sent today (alice's and 60 for dave),
-- nothing goes out within 60 or 61, and one more fits in 62.
insert into public.comments (track_id, author_id, body)
select pg_temp.make_track('22222222-2222-4222-8222-222222222222'), '11111111-1111-4111-8111-111111111111', 'For bob';
-- Sixty helpful notices for dave, each queued and marked sent a minute apart.
insert into public.notifications (user_id, kind, track_id)
select '44444444-4444-4444-8444-444444444444', 'helpful', track from ids, generate_series(1, 60);
update public.email_queue q
set sent_at = now() - make_interval(mins => r.n::integer)
from (
  select id, row_number() over (order by id) as n from public.email_queue
  where user_id = '44444444-4444-4444-8444-444444444444'
) r
where q.id = r.id;
set local role service_role;
select is((select count(*)::int from public.email_batch(20, 60)), 0, 'nothing is sent past the daily budget');
select is((select count(*)::int from public.email_batch(20, 61)), 0, 'the budget counts every email sent in the last 24 hours');
select is((select count(*)::int from public.email_batch(20, 62)), 1, 'and sends again once there is room');
reset role;

-- Refused three times: dropped from the batch.
update public.email_queue set attempts = 3, claimed_at = null where user_id = '22222222-2222-4222-8222-222222222222';
set local role service_role;
select is((select count(*)::int from public.email_batch(20, 1000)), 0, 'rows refused three times are not retried');
reset role;

select ok(
  not has_function_privilege('authenticated', 'public.email_batch(integer, integer)', 'execute')
    and not has_function_privilege('anon', 'public.email_batch(integer, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.mark_emails_sent(bigint[])', 'execute')
    and not has_function_privilege('anon', 'public.mark_emails_sent(bigint[])', 'execute')
    and not has_function_privilege('authenticated', 'public.mark_emails_failed(bigint[])', 'execute')
    and not has_table_privilege('anon', 'public.email_queue', 'select'),
  'only the service role can read or mark the queue'
);

-- Old sent rows are purged.
update public.email_queue set sent_at = now() - interval '8 days' where sent_at is not null;
update public.email_queue set created_at = now() - interval '4 days' where sent_at is null;
select private.purge_expired_data();
select is((select count(*)::int from public.email_queue), 0, 'sent rows go after 7 days, waiting ones after 3');

select * from finish();
rollback;
