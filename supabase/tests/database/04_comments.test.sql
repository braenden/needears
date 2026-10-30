-- Comments: authors edit their own, only the track owner marks Helpful,
-- counters and reputation follow, hidden things stay hidden, rate limit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);
\ir _helpers.psql

-- Alice owns the track. Bob and carol comment.
create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as track,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'hidden') as hidden_track,
  'c0000000-0000-4000-8000-00000000000b'::uuid as bob_comment,
  'c0000000-0000-4000-8000-00000000000c'::uuid as carol_comment,
  'c0000000-0000-4000-8000-00000000000a'::uuid as alice_comment;
grant select on ids to anon, authenticated;

insert into public.comments (id, track_id, author_id, time_ms, body)
select bob_comment, track, '22222222-2222-4222-8222-222222222222'::uuid, 5000, 'Bob says hi' from ids
union all
select carol_comment, track, '33333333-3333-4333-8333-333333333333', null, 'Carol says hi' from ids
union all
select alice_comment, track, '11111111-1111-4111-8111-111111111111', 1000, 'Alice on her own track' from ids;

select is((select comment_count from public.tracks where id = (select track from ids)), 3, 'comment_count follows inserts');
select is(
  (select count(*)::int from public.notifications
   where user_id = '11111111-1111-4111-8111-111111111111' and kind = 'comment'),
  2,
  'the track owner is notified about comments from others'
);

-- Bob -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ update public.comments set body = 'Bob edited' where id = (select bob_comment from ids) $$,
  'authors can edit their own comments'
);
update public.comments set body = 'Bob was here' where id = (select carol_comment from ids);
select throws_ok(
  $$ update public.comments set is_helpful = true where id = (select bob_comment from ids) $$,
  '42501', 'not_allowed', 'authors cannot mark their own comment Helpful'
);
select throws_ok(
  $$ insert into public.comments (track_id, body, is_helpful) values ((select track from ids), 'x', true) $$,
  '42501', null, 'is_helpful cannot be set on insert'
);
select throws_ok(
  $$ update public.comments set status = 'live' where id = (select bob_comment from ids) $$,
  '42501', null, 'authors cannot change the status of a comment'
);
select throws_ok(
  $$ insert into public.comments (track_id, body) values ((select hidden_track from ids), 'x') $$,
  '42501', null, 'nobody can comment on a hidden track'
);
select throws_ok(
  $$ insert into public.comments (track_id, time_ms, body) values ((select track from ids), 61000, 'x') $$,
  '22023', 'time_out_of_range', 'comments must be within the track'
);
select lives_ok(
  $$ insert into public.comments (track_id, parent_id, body)
     values ((select track from ids), (select carol_comment from ids), 'Reply') $$,
  'users can reply to a comment'
);
select throws_ok(
  $$ insert into public.comments (track_id, parent_id, body)
     values ((select track from ids), (select id from public.comments where body = 'Reply'), 'Reply to reply') $$,
  '22023', 'invalid_parent', 'replies are only one level deep'
);
select throws_ok(
  $$ insert into public.comments (track_id, author_id, body)
     values ((select track from ids), '33333333-3333-4333-8333-333333333333', 'Impersonation') $$,
  '42501', null, 'users cannot comment as someone else'
);
reset role;

select is((select body from public.comments where id = (select carol_comment from ids)), 'Carol says hi', 'users cannot edit other people''s comments');
select isnt((select edited_at from public.comments where id = (select bob_comment from ids)), null, 'edits set edited_at');
select is(
  (select count(*)::int from public.notifications
   where user_id = '33333333-3333-4333-8333-333333333333' and kind = 'reply'),
  1,
  'the parent author is notified about replies'
);

-- Carol tries to mark bob's comment Helpful on alice's track.
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set is_helpful = true where id = (select bob_comment from ids);
reset role;
select is((select is_helpful from public.comments where id = (select bob_comment from ids)), false, 'only the track owner can mark Helpful');

-- Alice ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ update public.comments set is_helpful = true where id = (select bob_comment from ids) $$,
  'the track owner can mark a comment Helpful'
);
select throws_ok(
  $$ update public.comments set body = 'Alice rewrote this' where id = (select bob_comment from ids) $$,
  '42501', 'not_allowed', 'the track owner cannot edit other people''s comments'
);
select throws_ok(
  $$ update public.comments set is_helpful = true where id = (select alice_comment from ids) $$,
  '42501', 'not_allowed', 'the track owner cannot mark their own comment Helpful'
);
select lives_ok(
  $$ update public.comments set resolved_at = now() where id = (select carol_comment from ids) $$,
  'the track owner can resolve a comment'
);
reset role;

select is((select reputation from public.profiles where handle = 'bob'), 1, 'Helpful raises the author''s reputation');
select isnt((select helpful_at from public.comments where id = (select bob_comment from ids)), null, 'Helpful sets helpful_at');
select is(
  (select count(*)::int from public.notifications
   where user_id = '22222222-2222-4222-8222-222222222222' and kind = 'helpful'),
  1,
  'the author is notified about Helpful'
);

-- Hidden comments -----------------------------------------------------------
update public.comments set status = 'hidden' where id = (select carol_comment from ids);
select is((select comment_count from public.tracks where id = (select track from ids)), 3, 'hidden comments do not count');

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is((select count(*)::int from public.comments where id = (select carol_comment from ids)), 0, 'anon does not see hidden comments');
reset role;

select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.comments where id = (select carol_comment from ids)), 1, 'authors see their own hidden comments');
reset role;

-- Rate limit: 60 comments per hour for a new account ------------------------
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
do $$
begin
  for i in 1..60 loop
    insert into public.comments (track_id, body) values ((select track from ids), 'Spam ' || i);
  end loop;
end;
$$;
select throws_ok(
  $$ insert into public.comments (track_id, body) values ((select track from ids), 'One too many') $$,
  'PT429', 'rate_limited', 'the 61st comment in an hour is rate limited'
);
reset role;

select * from finish();
rollback;
