-- Fixes from a usability test: Latest order, Needs ears without your own
-- tracks, search by artist, deleting your own comments, old handles and the
-- experience level of your last upload.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);
\ir _helpers.psql

-- Alice is the artist. Bob and carol listen. Dave is an admin.
create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as older,
  pg_temp.make_track('22222222-2222-4222-8222-222222222222') as newer,
  pg_temp.make_track('33333333-3333-4333-8333-333333333333') as elsewhere;
grant select on ids to anon, authenticated, service_role;
update public.tracks set published_at = now() - interval '2 hours', title = 'Older one'
where id = (select older from ids);
update public.tracks set published_at = now() - interval '5 minutes', title = 'Newer one'
where id = (select newer from ids);

create function pg_temp.as_user(p_user uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- 1. Latest -----------------------------------------------------------------
-- Bob gives feedback, which used to move his tracks six hours up.
insert into public.comments (track_id, author_id, body)
select elsewhere, '22222222-2222-4222-8222-222222222222', 'Giving back' from ids;
update public.comments set is_helpful = true, helpful_at = now() where body = 'Giving back';
select results_eq(
  $$ select f.id from public.feed_latest(p_page_size => 50) f
     where f.id in (select older from ids union select newer from ids) $$,
  $$ select newer from ids union all select older from ids $$,
  'Latest is newest published first, whoever gives feedback'
);

-- 3. Needs ears -----------------------------------------------------------
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select ok(
  not exists (select 1 from public.feed_needs_ears(p_page_size => 50) f join ids on f.id = ids.older),
  'your own tracks are not in your Needs ears'
);
select ok(
  exists (select 1 from public.feed_needs_ears(p_page_size => 50) f join ids on f.id = ids.newer),
  'other people''s tracks are'
);
reset role;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select ok(
  exists (select 1 from public.feed_needs_ears(p_page_size => 50) f join ids on f.id = ids.older),
  'signed out, every track that needs ears is there'
);

-- 2. Search ----------------------------------------------------------------
select ok(
  exists (select 1 from public.search('alice') s join ids on s.id = ids.older where s.kind = 'track'),
  'searching a handle finds that artist''s tracks'
);
reset role;
update public.profiles set display_name = 'Nora Lind' where handle = 'bob';
set local role anon;
select ok(
  exists (select 1 from public.search('nora lind') s join ids on s.id = ids.newer where s.kind = 'track'),
  'searching a display name finds that artist''s tracks'
);
select is(
  (select kind from public.search('alice') limit 1),
  'profile',
  'the artist comes before their tracks'
);
reset role;

-- 4. Editing and deleting comments ------------------------------------------
insert into public.comments (track_id, author_id, body)
select older, '33333333-3333-4333-8333-333333333333', 'Carol alone' from ids;
insert into public.comments (track_id, author_id, body)
select older, '33333333-3333-4333-8333-333333333333', 'Carol with replies' from ids;
insert into public.comments (track_id, author_id, parent_id, body)
select older, '22222222-2222-4222-8222-222222222222',
  (select id from public.comments where body = 'Carol with replies'), 'Bob replies'
from ids;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set local role authenticated;
update public.comments set is_helpful = true where body = 'Carol with replies';
reset role;

select results_eq(
  $$ select comment_count, listener_count, listener_comment_count, has_helpful
     from public.tracks where id = (select older from ids) $$,
  $$ values (3, 2, 3, true) $$,
  'before: three comments by two listeners, one marked Helpful by the artist'
);

-- Editing.
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
update public.comments set body = 'Edited by someone else' where body = 'Carol alone';
reset role;
select is(
  (select count(*)::int from public.comments where body = 'Carol alone'),
  1,
  'nobody edits someone else''s comment'
);
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select lives_ok(
  $$ update public.comments set body = 'Carol, edited' where body = 'Carol alone' $$,
  'authors edit their own comment'
);
reset role;
select ok(
  (select edited_at is not null from public.comments where body = 'Carol, edited'),
  'an edit is marked edited'
);

-- Deleting, by someone else.
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok(
  $$ select public.delete_comment((select id from public.comments where body = 'Carol, edited')) $$,
  'P0002', 'not_found', 'nobody deletes someone else''s comment'
);
reset role;

-- By the author, without replies.
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select is(
  public.delete_comment((select id from public.comments where body = 'Carol, edited')),
  'deleted',
  'a comment without replies is deleted'
);
-- A plain delete of a comment with replies is refused; delete_comment withdraws it.
select throws_ok(
  $$ delete from public.comments where body = 'Carol with replies' $$,
  '22023', 'has_replies', 'a comment with replies is not deleted directly'
);
select is(
  public.delete_comment((select id from public.comments where body = 'Carol with replies')),
  'withdrawn',
  'a comment with replies is withdrawn'
);
reset role;

select results_eq(
  $$ select status::text, body, author_id, is_helpful from public.comments
     where id = (select parent_id from public.comments where body = 'Bob replies') $$,
  $$ values ('withdrawn', '', null::uuid, false) $$,
  'a withdrawn comment keeps its place without its text, author or Helpful mark'
);
select results_eq(
  $$ select comment_count, listener_count, listener_comment_count, has_helpful
     from public.tracks where id = (select older from ids) $$,
  $$ values (1, 1, 1, false) $$,
  'deleted and withdrawn comments leave every count'
);
select is(
  (select reputation from public.profiles where handle = 'carol'),
  0,
  'and a withdrawn Helpful comment no longer counts for reputation'
);
select is(
  (select count(*)::int from public.notifications n
   where n.comment_id = (select parent_id from public.comments where body = 'Bob replies')
     and n.kind in ('comment', 'helpful')),
  0,
  'its notifications are gone'
);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select results_eq(
  $$ select c.status::text, c.body from public.comments c
     where c.id = (select parent_id from public.comments where body = 'Bob replies') $$,
  $$ values ('withdrawn', '') $$,
  'everyone sees the withdrawn comment as a gap in the thread'
);
reset role;

select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
update public.comments set body = 'Back again'
where id = (select parent_id from public.comments where body = 'Bob replies');
reset role;
select is(
  (select body from public.comments where id = (select parent_id from public.comments where body = 'Bob replies')),
  '',
  'a withdrawn comment cannot be edited back'
);
select throws_ok(
  $$ insert into public.comments (track_id, author_id, parent_id, body)
     select older, '22222222-2222-4222-8222-222222222222',
       (select parent_id from public.comments where body = 'Bob replies'), 'Another reply'
     from ids $$,
  null, null, 'nobody replies to a withdrawn comment'
);
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok(
  $$ insert into public.reports (reporter_id, target_type, comment_id, reason)
     values ('22222222-2222-4222-8222-222222222222', 'comment',
       (select parent_id from public.comments where body = 'Bob replies'), 'spam') $$,
  '42501', null, 'nobody reports a withdrawn comment'
);
reset role;

-- The last reply goes, and the withdrawn comment with it.
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select is(
  public.delete_comment((select id from public.comments where body = 'Bob replies')),
  'deleted',
  'the reply is deleted'
);
reset role;
select is(
  (select count(*)::int from public.comments where track_id = (select older from ids) and status = 'withdrawn'),
  0,
  'a withdrawn comment without replies goes too'
);

-- Admins delete anyone's comment.
insert into public.comments (track_id, author_id, body)
select older, '33333333-3333-4333-8333-333333333333', 'For the admin' from ids;
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
set local role authenticated;
select is(
  public.delete_comment((select id from public.comments where body = 'For the admin')),
  'deleted',
  'admins can delete any comment'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.delete_comment(uuid)', 'execute'),
  'signed out, nobody deletes'
);

-- A hidden comment with replies stays as moderation left it.
insert into public.comments (track_id, author_id, body)
select older, '33333333-3333-4333-8333-333333333333', 'Moderated parent' from ids;
insert into public.comments (track_id, author_id, parent_id, body)
select older, '22222222-2222-4222-8222-222222222222',
  (select id from public.comments where body = 'Moderated parent'), 'Reply to moderated'
from ids;
update public.comments set status = 'hidden' where body = 'Moderated parent';
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
set local role authenticated;
select throws_ok(
  $$ select public.delete_comment((select id from public.comments where body = 'Moderated parent')) $$,
  '22023', 'has_replies', 'admins hide a moderated comment with replies, they do not withdraw it'
);
reset role;

-- 5. Old handles -----------------------------------------------------------
update public.profiles set handle = 'carol_new' where handle = 'carol';
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is(public.resolve_old_handle('carol'), 'carol_new', 'an old handle points to the new one');
select is(public.resolve_old_handle(' CAROL '), 'carol_new', 'whatever the case');
select is(public.resolve_old_handle('nobody_here'), null, 'an unknown handle points nowhere');
select throws_ok('select * from public.handle_history', '42501', null, 'the history itself is not public');
reset role;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select is((select count(*)::int from public.handle_history), 1, 'people see their own old handles');
reset role;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select is((select count(*)::int from public.handle_history), 0, 'but not other people''s');
reset role;

update public.profiles set handle = 'carol' where handle = 'bob';
set local role anon;
select is(public.resolve_old_handle('carol'), null, 'once someone else takes it, the old handle stops pointing');
select is(public.resolve_old_handle('bob'), 'carol', 'and their own old handle points to them');
reset role;

update public.profiles set handle = 'carol_' || n
from generate_series(1, 7) n
where id = '33333333-3333-4333-8333-333333333333';
do $$
begin
  for i in 1..7 loop
    update public.profiles set handle = 'carol_v' || i where id = '33333333-3333-4333-8333-333333333333';
  end loop;
end;
$$;
select is(
  (select count(*)::int from public.handle_history where profile_id = '33333333-3333-4333-8333-333333333333'),
  5,
  'at most five old handles are kept'
);
update public.handle_history set changed_at = now() - interval '91 days' where handle = 'carol_v1';
set local role anon;
select is(public.resolve_old_handle('carol_v1'), null, 'an old handle points nowhere after 90 days');
reset role;
select private.purge_expired_data();
select ok(not exists (select 1 from public.handle_history where handle = 'carol_v1'), 'and is purged');
update public.profiles set banned_at = now() where id = '33333333-3333-4333-8333-333333333333';
set local role anon;
select is(public.resolve_old_handle('carol_v6'), null, 'a banned profile is not looked up');
reset role;

-- 7. Experience level of your last upload ------------------------------------
update public.tracks set level = 'advanced', status = 'hidden' where id = (select older from ids);
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select is(
  (select level::text from public.tracks
   where owner_id = '11111111-1111-4111-8111-111111111111'
   order by created_at desc limit 1),
  'advanced',
  'the owner reads the level of their latest track, even a hidden one'
);
reset role;

select * from finish();
rollback;
