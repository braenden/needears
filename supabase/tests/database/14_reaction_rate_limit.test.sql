-- Reactions are rate limited (issue 006). The limit is lowered for the
-- test and rolled back afterwards.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
\ir _helpers.psql

create temp table ids as
select pg_temp.make_track('11111111-1111-4111-8111-111111111111') as track;
grant select on ids to authenticated;
update public.reputation_levels set reactions_per_hour = 2 where id = 'new_ear';

select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
insert into public.reactions (track_id, kind) values ((select track from ids), 'fire');
delete from public.reactions where kind = 'fire';
insert into public.reactions (track_id, kind) values ((select track from ids), 'fire');
select throws_ok(
  $$ insert into public.reactions (track_id, kind) values ((select track from ids), 'heart') $$,
  'PT429', 'rate_limited', 'toggling a reaction runs into the hourly limit'
);
select throws_ok(
  $$ update public.reactions set kind = 'heart' where kind = 'fire' $$,
  'PT429', 'rate_limited', 'changing a reaction counts against the same limit'
);
-- An update to the same kind is free, and must not write the track row
-- (a new row version would mean the counts were recomputed).
create temp table before_ctid as select ctid as c from public.tracks where id = (select track from ids);
select lives_ok(
  $$ update public.reactions set kind = 'fire' where kind = 'fire' $$,
  'an update to the same kind is not limited'
);
select is(
  (select ctid from public.tracks where id = (select track from ids)),
  (select c from before_ctid),
  'an update to the same kind leaves the track row alone'
);
select lives_ok(
  $$ delete from public.reactions where kind = 'fire' $$,
  'removing a reaction is always allowed'
);
reset role;

select is((select reactions_per_hour from public.reputation_levels where id = 'golden_ear'), 360,
  'the limits come from src/config/reputation.ts');

select * from finish();
rollback;
