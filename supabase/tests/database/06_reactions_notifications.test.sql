-- Reactions are private per user with public counts. Notifications are
-- private and written by triggers only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
\ir _helpers.psql

create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as track,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'hidden') as hidden_track;
grant select on ids to anon, authenticated;

create function pg_temp.react_as(p_user uuid, p_kind public.reaction_kind)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.reactions (track_id, kind) values ((select track from ids), p_kind);
  reset role;
end;
$$;

select pg_temp.react_as('22222222-2222-4222-8222-222222222222', 'fire');
select pg_temp.react_as('33333333-3333-4333-8333-333333333333', 'fire');
select pg_temp.react_as('44444444-4444-4444-8444-444444444444', 'heart');

select is(
  (select reaction_counts from public.tracks where id = (select track from ids)),
  '{"fire": 2, "heart": 1}'::jsonb,
  'reaction_counts follows inserts'
);
select throws_ok(
  $$ select pg_temp.react_as('33333333-3333-4333-8333-333333333333', 'heart') $$,
  '23505', null, 'one reaction per person per track'
);

-- Choosing another reaction replaces it.
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.reactions (track_id, kind) values ((select track from ids), 'eyes')
     on conflict (track_id, user_id) do update set kind = excluded.kind $$,
  'choosing another reaction replaces the old one'
);
update public.reactions set kind = 'heart' where user_id = '22222222-2222-4222-8222-222222222222';
reset role;
select is(
  (select reaction_counts from public.tracks where id = (select track from ids)),
  '{"eyes": 1, "heart": 1, "fire": 1}'::jsonb,
  'counts follow a changed reaction, and nobody can change someone else''s'
);

select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.reactions), 1, 'users only see their own reactions');
update public.reactions set kind = 'heart';
delete from public.reactions where user_id = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  $$ insert into public.reactions (track_id, kind) values ((select hidden_track from ids), 'fire') $$,
  '42501', null, 'nobody can react to a hidden track'
);
reset role;

select is(
  (select reaction_counts from public.tracks where id = (select track from ids)),
  '{"eyes": 1, "heart": 2}'::jsonb,
  'users can change and keep their own reaction, not remove other people''s'
);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok('select * from public.reactions', '42501', null, 'anon cannot read reactions');
select is(
  (select reaction_counts from public.tracks where id = (select track from ids)),
  '{"eyes": 1, "heart": 2}'::jsonb,
  'reaction counts are public'
);
reset role;

-- Notifications -------------------------------------------------------------
insert into public.comments (track_id, author_id, body)
values ((select track from ids), '22222222-2222-4222-8222-222222222222', 'Nice');

select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.notifications), 0, 'users do not see other people''s notifications');
update public.notifications set read_at = now();
delete from public.notifications;
select throws_ok(
  $$ insert into public.notifications (user_id, kind) values ('33333333-3333-4333-8333-333333333333', 'comment') $$,
  '42501', null, 'users cannot create notifications'
);
reset role;
select is(
  (select count(*)::int from public.notifications
   where user_id = '11111111-1111-4111-8111-111111111111' and read_at is null),
  1,
  'other users cannot mark or delete your notifications'
);

select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.notifications), 1, 'users see their own notifications');
select lives_ok($$ update public.notifications set read_at = now() $$, 'users can mark their notifications read');
select throws_ok(
  $$ update public.notifications set user_id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', null, 'users cannot move notifications to someone else'
);
reset role;

select * from finish();
rollback;
