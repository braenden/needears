-- Comments on a range, and reference tracks.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
\ir _helpers.psql

create temp table ids (track uuid, parent uuid);
grant select on ids to authenticated;
insert into ids (track) values (pg_temp.make_track('11111111-1111-4111-8111-111111111111'));

select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.comments (track_id, time_ms, end_ms, body)
     values ((select track from ids), 10000, 25000, 'This part drags') $$,
  'a comment can cover a range'
);
select throws_ok(
  $$ insert into public.comments (track_id, time_ms, end_ms, body) values ((select track from ids), 10000, 10000, 'x') $$,
  '22023', 'invalid_range', 'a range must end after it starts'
);
select throws_ok(
  $$ insert into public.comments (track_id, end_ms, body) values ((select track from ids), 10000, 'x') $$,
  '22023', 'invalid_range', 'a range needs a start'
);
select throws_ok(
  $$ insert into public.comments (track_id, time_ms, end_ms, body) values ((select track from ids), 10000, 61000, 'x') $$,
  '22023', 'invalid_range', 'a range must end within the track'
);
reset role;
update ids set parent = (select id from public.comments where body = 'This part drags');

select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
insert into public.comments (track_id, parent_id, end_ms, body) values ((select track from ids), (select parent from ids), 59000, 'Agree');
reset role;

-- The track owner can update the row (to mark Helpful), but not the range.
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ update public.comments set end_ms = 40000 where id = (select parent from ids) $$,
  '42501', 'not_allowed', 'the track owner cannot change someone else''s range'
);
reset role;
select results_eq(
  $$ select time_ms, end_ms from public.comments where body = 'Agree' $$,
  $$ values (10000, 25000) $$,
  'a reply shares its parent''s range'
);
select is((select end_ms from public.comments where id = (select parent from ids)), 25000, 'only the author can change the range');

select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set time_ms = 5000, end_ms = 30000 where id = (select parent from ids);
reset role;
select results_eq(
  $$ select time_ms, end_ms from public.comments where body = 'Agree' $$,
  $$ values (5000, 30000) $$,
  'replies move with their parent''s range'
);

-- Reference tracks.
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ update public.tracks set reference_url = ' https://www.youtube.com/watch?v=abc ' where id = (select track from ids) $$,
  'owners can set a reference track on an allowed host'
);
select throws_ok(
  $$ update public.tracks set reference_url = 'https://evil.example/track' where id = (select track from ids) $$,
  '22023', 'invalid_link', 'other hosts are rejected'
);
select throws_ok(
  $$ update public.tracks set reference_url = 'javascript:alert(1)' where id = (select track from ids) $$,
  '22023', 'invalid_link', 'only https links'
);
select lives_ok(
  $$ update public.tracks set reference_url = '' where id = (select track from ids) $$,
  'an empty reference clears it'
);
reset role;
select is((select reference_url from public.tracks where id = (select track from ids)), null, 'cleared to null');

select * from finish();
rollback;
