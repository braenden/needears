-- Moderated comments stay as a record, replies need a live parent, and
-- editing a Helpful comment clears the mark.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
\ir _helpers.psql

create temp table ids (track uuid, hidden_comment uuid, live_comment uuid, helpful_comment uuid, hidden_parent uuid);
grant select, update on ids to authenticated;

insert into ids (track) values (pg_temp.make_track('11111111-1111-4111-8111-111111111111'));

-- Bob writes three comments on alice's track.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
with c as (insert into public.comments (track_id, body) values ((select track from ids), 'reported') returning id)
update ids set hidden_comment = (select id from c);
with c as (insert into public.comments (track_id, body) values ((select track from ids), 'fine') returning id)
update ids set live_comment = (select id from c);
with c as (insert into public.comments (track_id, body) values ((select track from ids), 'great mix notes') returning id)
update ids set helpful_comment = (select id from c);
reset role;

-- Three established accounts with some standing report the first one,
-- which hides it.
update public.profiles set reputation = 1 where handle in ('alice', 'carol', 'dave');
insert into public.reports (reporter_id, target_type, comment_id, reason)
select u, 'comment', (select hidden_comment from ids), 'harassment'
from unnest(array[
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444'
]::uuid[]) u;
select is((select status::text from public.comments where id = (select hidden_comment from ids)), 'hidden', 'three reports hide the comment');

-- The author tries to delete the hidden comment and its reports.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
delete from public.comments where id = (select hidden_comment from ids);
delete from public.comments where id = (select live_comment from ids);
reset role;
select is((select count(*)::int from public.comments where id = (select hidden_comment from ids)), 1, 'authors cannot delete a hidden comment');
select is((select count(*)::int from public.reports where comment_id = (select hidden_comment from ids)), 3, 'the reports on it stay');
select is((select count(*)::int from public.comments where id = (select live_comment from ids)), 0, 'authors can still delete their live comments');

-- Admins can delete any comment.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
delete from public.comments where id = (select hidden_comment from ids);
reset role;
select is((select count(*)::int from public.comments where id = (select hidden_comment from ids)), 0, 'admins can delete a hidden comment');

-- Replies need a live parent.
insert into public.comments (track_id, author_id, body) values ((select track from ids), '33333333-3333-4333-8333-333333333333', 'to be hidden');
update public.comments set status = 'hidden' where body = 'to be hidden';
update ids set hidden_parent = (select id from public.comments where body = 'to be hidden');
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into public.comments (track_id, parent_id, body)
     values ((select track from ids), (select hidden_parent from ids), 'reply') $$,
  '22023', 'invalid_parent', 'nobody can reply to a hidden comment'
);
reset role;

-- Alice marks bob's comment Helpful, then bob rewrites it.
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set is_helpful = true where id = (select helpful_comment from ids);
reset role;
select is((select reputation from public.profiles where handle = 'bob'), 1, 'Helpful gives bob reputation');

select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set body = 'buy followers at example dot com' where id = (select helpful_comment from ids);
reset role;
select is((select is_helpful from public.comments where id = (select helpful_comment from ids)), false, 'editing the text clears Helpful');
select is((select reputation from public.profiles where handle = 'bob'), 0, 'and the reputation that came with it');

select * from finish();
rollback;
