-- Replies are one level deep, keep their parent's time and notify the
-- parent's author. Only the track owner resolves, and only top level
-- comments.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
\ir _helpers.psql

create temp table ids (track uuid, other_track uuid, parent uuid, reply uuid, own_reply uuid);
grant select, update on ids to authenticated;
insert into ids (track, other_track) values (
  pg_temp.make_track('11111111-1111-4111-8111-111111111111'),
  pg_temp.make_track('33333333-3333-4333-8333-333333333333')
);

-- Bob comments at 0:05, carol replies, bob replies to his own comment.
insert into public.comments (track_id, author_id, time_ms, body)
select track, '22222222-2222-4222-8222-222222222222', 5000, 'Kick is weak' from ids;
update ids set parent = (select id from public.comments where body = 'Kick is weak');

select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
with c as (
  insert into public.comments (track_id, parent_id, time_ms, body)
  values ((select track from ids), (select parent from ids), 40000, 'Agree') returning id
)
update ids set reply = (select id from c);
select lives_ok(
  $$ insert into public.comments (track_id, parent_id, time_ms, body)
     values ((select track from ids), (select parent from ids), 999999, 'Out of range is ignored') $$,
  'a reply ignores the time it was sent with'
);
select throws_ok(
  $$ insert into public.comments (track_id, parent_id, body)
     values ((select track from ids), (select reply from ids), 'Reply to a reply') $$,
  '22023', 'invalid_parent', 'a reply cannot have a reply'
);
select throws_ok(
  $$ insert into public.comments (track_id, parent_id, body)
     values ((select other_track from ids), (select parent from ids), 'Wrong track') $$,
  '22023', 'invalid_parent', 'a reply must be on the same track as its parent'
);
reset role;

select is((select time_ms from public.comments where id = (select reply from ids)), 5000, 'a reply takes its parent''s time');

select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set time_ms = 1000, body = 'Agree, edited' where id = (select reply from ids);
reset role;
select results_eq(
  $$ select time_ms, body from public.comments where id = (select reply from ids) $$,
  $$ values (5000, 'Agree, edited') $$,
  'editing a reply keeps the parent''s time'
);

select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
with c as (
  insert into public.comments (track_id, parent_id, body)
  values ((select track from ids), (select parent from ids), 'Thanks') returning id
)
update ids set own_reply = (select id from c);
reset role;

-- Notifications ---------------------------------------------------------------
select is(
  (select count(*)::int from public.notifications
   where user_id = '22222222-2222-4222-8222-222222222222' and kind = 'reply'
     and comment_id = (select reply from ids)),
  1,
  'the parent''s author is notified about a reply'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = '22222222-2222-4222-8222-222222222222' and comment_id = (select own_reply from ids)),
  0,
  'replying in your own thread notifies nobody about yourself'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = '11111111-1111-4111-8111-111111111111' and kind = 'comment'
     and comment_id in ((select reply from ids), (select own_reply from ids))),
  2,
  'the track owner hears about replies on their track'
);

-- Alice replies on her own track: bob gets a reply, alice nothing.
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
insert into public.comments (track_id, parent_id, body) values ((select track from ids), (select parent from ids), 'Will fix');
reset role;
select is(
  (select count(*)::int from public.notifications n join public.comments c on c.id = n.comment_id
   where c.body = 'Will fix' and n.user_id = '11111111-1111-4111-8111-111111111111'),
  0,
  'the owner is not notified about their own reply'
);
select is(
  (select count(*)::int from public.notifications n join public.comments c on c.id = n.comment_id
   where c.body = 'Will fix' and n.user_id = '22222222-2222-4222-8222-222222222222' and n.kind = 'reply'),
  1,
  'the parent''s author is notified about the owner''s reply'
);

-- Resolved -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ update public.comments set resolved_at = now() where id = (select parent from ids) $$,
  '42501', 'not_allowed', 'the author cannot resolve their own comment'
);
reset role;

select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set resolved_at = now() where id = (select parent from ids);
reset role;
select is((select resolved_at from public.comments where id = (select parent from ids)), null, 'other users cannot resolve');

select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ update public.comments set resolved_at = now() where id = (select parent from ids) $$,
  'the track owner can resolve a top level comment'
);
select throws_ok(
  $$ update public.comments set resolved_at = now() where id = (select reply from ids) $$,
  '42501', 'not_allowed', 'replies cannot be resolved'
);
select lives_ok(
  $$ update public.comments set resolved_at = null where id = (select parent from ids) $$,
  'the track owner can clear Resolved'
);
reset role;
select is((select resolved_at from public.comments where id = (select parent from ids)), null, 'Resolved is cleared');

-- Moving the parent moves the thread.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set time_ms = 30000 where id = (select parent from ids);
reset role;
select is(
  (select array_agg(distinct time_ms) from public.comments where parent_id = (select parent from ids)),
  array[30000],
  'replies move with their parent'
);
-- As a trusted writer (no user JWT), the check constraint still holds.
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ update public.comments set resolved_at = now() where id = (select reply from ids) $$,
  '23514', null, 'no writer can resolve a reply'
);

select * from finish();
rollback;
