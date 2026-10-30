-- Restoring dismisses open reports (issue 010), authors cannot edit hidden
-- comments (issue 014), the feed page number is capped (issue 022), and the
-- record rules: owners cannot edit hidden tracks,
-- reported comments and tracks cannot be deleted by their authors, and
-- reports outlive the reporter's account. Avatars only come from Google
-- (issue 007).
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
\ir _helpers.psql

create temp table ids (track uuid, comment uuid);
grant select on ids to authenticated;
insert into ids (track) values (pg_temp.make_track('11111111-1111-4111-8111-111111111111'));
insert into public.comments (track_id, author_id, body)
values ((select track from ids), '22222222-2222-4222-8222-222222222222', 'rude');
update ids set comment = (select id from public.comments where body = 'rude');

-- Three reporters with standing hide the track and the comment.
update public.profiles set reputation = 1 where handle in ('alice', 'bob', 'carol', 'dave');
insert into public.reports (reporter_id, target_type, track_id, reason)
select u, 'track', (select track from ids), 'spam'
from unnest(array['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444']::uuid[]) u;
insert into public.reports (reporter_id, target_type, comment_id, reason)
select u, 'comment', (select comment from ids), 'harassment'
from unnest(array['11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444']::uuid[]) u;

-- 014: the author cannot rewrite the hidden comment.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set body = 'nice track' where id = (select comment from ids);
reset role;
select is((select body from public.comments where id = (select comment from ids)), 'rude',
  'authors cannot edit a hidden comment');

-- 010: the admin restores both, which dismisses their open reports.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select public.admin_set_track_status((select track from ids), 'live');
select public.admin_set_comment_status((select comment from ids), 'live');
reset role;
select is((select count(*)::int from public.reports where status = 'open'
    and (track_id = (select track from ids) or comment_id = (select comment from ids))), 0,
  'restoring dismisses the open reports');
select is((select count(*)::int from public.reports where status = 'dismissed' and resolved_by = '44444444-4444-4444-8444-444444444444'), 6,
  'and records who dismissed them');

-- One more report from a reporter with standing does not hide it again.
update public.profiles set reputation = 1 where handle = 'bob';
insert into public.reports (reporter_id, target_type, track_id, reason)
values ('11111111-1111-4111-8111-111111111111', 'track', (select track from ids), 'spam');
select is((select status::text from public.tracks where id = (select track from ids)), 'live',
  'a new report after a restore does not hide it again');

-- 014: live comments can still be edited.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set body = 'sorry, nice track' where id = (select comment from ids);
reset role;
select is((select body from public.comments where id = (select comment from ids)), 'sorry, nice track',
  'authors can edit a live comment');

-- 022: a page beyond 50 returns the same rows as page 50 (nothing here).
select is((select count(*)::int from public.feed_latest(null, 1000000, 50)), 0,
  'a huge page number is capped');

-- Owners cannot edit a hidden track.
create temp table hidden as select pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'hidden') as id;
grant select on hidden to authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
update public.tracks set title = 'Harmless' where id = (select id from hidden);
update public.tracks set title = 'Renamed' where id = (select track from ids);
reset role;
select is((select title from public.tracks where id = (select id from hidden)), 'Test track',
  'owners cannot edit a hidden track');
select is((select title from public.tracks where id = (select track from ids)), 'Renamed',
  'owners can still edit a live track');

-- A reported live comment cannot be deleted by its author.
select is(public.track_under_review((select track from ids)), true,
  'the track is under review while it has an open report');
insert into public.comments (track_id, author_id, body)
values ((select track from ids), '22222222-2222-4222-8222-222222222222', 'spam link');
insert into public.reports (reporter_id, target_type, comment_id, reason)
values ('33333333-3333-4333-8333-333333333333', 'comment',
  (select id from public.comments where body = 'spam link'), 'spam');
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ delete from public.comments where body = 'spam link' $$,
  '42501', 'not_allowed', 'authors cannot delete a comment with open reports'
);
reset role;

-- Reports outlive the reporter's account.
delete from auth.users where id = '33333333-3333-4333-8333-333333333333';
select is(
  (select count(*)::int from public.reports
   where comment_id = (select id from public.comments where body = 'spam link') and reporter_id is null),
  1, 'a report stays when the reporter deletes their account'
);

-- After the admin has dealt with the reports the owner can delete again.
update public.reports set status = 'dismissed' where status = 'open';
select is(public.track_under_review((select track from ids)), false,
  'no open reports, no review');

-- Reports keep a copy of what was reported, so an edit after the report
-- does not change what the admin sees.
insert into public.comments (track_id, author_id, body)
values ((select track from ids), '22222222-2222-4222-8222-222222222222', 'you are awful');
insert into public.reports (reporter_id, target_type, comment_id, reason)
values ('11111111-1111-4111-8111-111111111111', 'comment',
  (select id from public.comments where body = 'you are awful'), 'harassment');
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set body = '.' where body = 'you are awful';
reset role;
select is(
  (select reported_text from public.reports
   where comment_id = (select id from public.comments where body = '.')),
  'you are awful', 'the report keeps the text as it was reported'
);
select is(
  (select reported_text from public.reports where target_type = 'track' and track_id = (select track from ids)
   order by created_at limit 1),
  'Test track', 'a track report keeps the title it had when reported, not the later rename'
);

-- Avatars: only Google profile pictures (issue 007).
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ update public.profiles set avatar_url = 'https://tracker.example/pixel.gif' where handle = 'bob' $$,
  '23514', null, 'a profile picture on another host is refused'
);
select lives_ok(
  $$ update public.profiles set avatar_url = 'https://lh3.googleusercontent.com/a/abc=s96-c' where handle = 'bob' $$,
  'a Google profile picture is fine'
);
reset role;
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999', 'authenticated',
  'authenticated', 'pixel@test.local', '{"handle": "pixel", "avatar_url": "https://tracker.example/p.gif"}', now(), now());
select is((select avatar_url from public.profiles where handle = 'pixel'), null,
  'sign up drops a picture on another host instead of failing');

select * from finish();
rollback;
