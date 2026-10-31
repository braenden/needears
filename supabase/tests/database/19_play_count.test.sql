-- Plays: counted once per listener and track an hour, never for the owner,
-- only on live tracks, capped per listener, and only through record_play.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
\ir _helpers.psql

create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as track,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'hidden') as hidden;
grant select on ids to authenticated, anon;

select ok(public.record_play((select track from ids), 'ip:abc'), 'a first play counts');
select ok(not public.record_play((select track from ids), 'ip:abc'), 'the same listener within the hour does not');
select ok(public.record_play((select track from ids), 'u:22222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222'), 'a signed in listener counts');
select ok(not public.record_play((select track from ids), 'u:11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111'), 'the owner listening back does not');
select is((select play_count from public.tracks where id = (select track from ids)), 2,
  'play_count went up once per counted play');

select throws_ok(
  $$ select public.record_play((select hidden from ids), 'ip:abc') $$,
  '22023', 'not_found', 'hidden tracks are not counted'
);

-- 120 plays an hour from one listener, then rate_limited.
insert into private.play_events (track_id, listener)
select (select hidden from ids), 'ip:script' from generate_series(1, 120);
select throws_ok(
  $$ select public.record_play((select track from ids), 'ip:script') $$,
  'PT429', 'rate_limited', 'one listener is capped at 120 plays an hour'
);

-- Nobody but the service role can call it or write the count.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.record_play((select track from ids), 'ip:me') $$,
  '42501', null, 'signed in users cannot call record_play'
);
select throws_ok(
  $$ update public.tracks set play_count = 999 where id = (select track from ids) $$,
  '42501', null, 'users cannot write play_count'
);
reset role;

select is(
  (select count(*)::int from cron.job where command = 'select private.purge_expired_data()'),
  1, 'old play events are purged with the other short lived data'
);

select * from finish();
rollback;
