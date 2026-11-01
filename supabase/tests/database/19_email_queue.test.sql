-- Email queue: comments, replies and Helpful marks are notifications on the
-- site only and are never queued; security emails are queued and sent, and
-- the queue is read and marked only by the service role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
\ir _helpers.psql

create temp table ids (track uuid);
grant select on ids to authenticated, service_role;
insert into ids values (pg_temp.make_track('11111111-1111-4111-8111-111111111111'));

-- A comment, a reply and a Helpful mark.
insert into public.comments (track_id, author_id, time_ms, body)
select track, '22222222-2222-4222-8222-222222222222', 5000, 'Kick weak' from ids;
insert into public.comments (track_id, author_id, parent_id, body)
select track, '11111111-1111-4111-8111-111111111111',
  (select id from public.comments where body = 'Kick weak'), 'Thanks'
from ids;
insert into public.notifications (user_id, kind, track_id)
select '22222222-2222-4222-8222-222222222222', 'helpful', track from ids;

select ok(
  (select count(*)::int from public.notifications
   where user_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
     and kind in ('comment', 'reply', 'helpful')) >= 3,
  'comments, replies and Helpful marks are still notifications on the site'
);
select is(
  (select count(*)::int from public.email_queue where notification_id is not null),
  0,
  'no notification is queued for email'
);
select ok(
  not exists (select 1 from pg_trigger where tgname = 'notifications_queue_email'),
  'the trigger that queued notification emails is gone'
);
select hasnt_function('public', 'email_batch', array['integer', 'integer'], 'the digest batch is gone');

-- A security email is queued and handed out as before.
update auth.users set email_confirmed_at = now() - interval '30 days'
where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
update auth.users set email = 'alice.new@test.local'
where id = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$ select kind, recipient from public.email_queue
     where user_id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values ('email_changed', 'alice@test.local') $$,
  'changing the email address queues a security email to the old address'
);

set local role service_role;
create temp table got as
select * from public.security_email_batch(20, 60)
where user_id = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$ select kind, recipients from got $$,
  $$ values ('email_changed', array['alice.new@test.local', 'alice@test.local']) $$,
  'the security batch sends it to the old and the new address'
);
select public.mark_emails_sent(array[queue_id], 2) from got;
update public.email_queue set claimed_at = null;
select is(
  (select count(*)::int from public.security_email_batch(20, 60)
   where user_id = '11111111-1111-4111-8111-111111111111'),
  0,
  'a sent security email is not sent again'
);
select is(
  (select sends from public.email_queue where user_id = '11111111-1111-4111-8111-111111111111'),
  2,
  'the send counts both addresses for the daily budget'
);
reset role;

-- Refused three times: dropped from the batch.
update auth.users set email = 'bob.new@test.local'
where id = '22222222-2222-4222-8222-222222222222';
update public.email_queue set attempts = 3 where user_id = '22222222-2222-4222-8222-222222222222';
set local role service_role;
select is(
  (select count(*)::int from public.security_email_batch(20, 1000)
   where user_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'rows refused three times are not retried'
);
reset role;

select ok(
  not has_function_privilege('authenticated', 'public.security_email_batch(integer, integer)', 'execute')
    and not has_function_privilege('anon', 'public.security_email_batch(integer, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.mark_emails_sent(bigint[], integer)', 'execute')
    and not has_function_privilege('anon', 'public.mark_emails_sent(bigint[], integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.mark_emails_failed(bigint[])', 'execute')
    and not has_table_privilege('anon', 'public.email_queue', 'select')
    and not has_table_privilege('authenticated', 'public.email_queue', 'select'),
  'only the service role can read or mark the queue'
);

-- Old rows are purged.
update public.email_queue set sent_at = now() - interval '8 days' where sent_at is not null;
update public.email_queue set created_at = now() - interval '4 days' where sent_at is null;
select private.purge_expired_data();
select is((select count(*)::int from public.email_queue), 0, 'sent rows go after 7 days, waiting ones after 3');

select * from finish();
rollback;
