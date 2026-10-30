-- Trust rules:
-- one track owner gives one person at most three reputation, Helpful from
-- new or banned owners does not count, and auto hide only counts reporters
-- with an account a week old and some reputation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
\ir _helpers.psql

-- eve is two days old, the rest are 30 days old (helpers).
select pg_temp.make_user('55555555-5555-4555-8555-555555555555', 'eve', interval '2 days');

create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as alice_track,
  pg_temp.make_track('33333333-3333-4333-8333-333333333333') as carol_track,
  pg_temp.make_track('55555555-5555-4555-8555-555555555555') as eve_track,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as target;
grant select on ids to authenticated;

-- Writes a comment by p_author on p_track and marks it Helpful as the owner.
create function pg_temp.helpful(p_author uuid, p_track uuid)
returns void
language plpgsql
as $$
declare
  cid uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.comments (track_id, author_id, body) values (p_track, p_author, 'notes')
  returning id into cid;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', (select owner_id from public.tracks where id = p_track), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.comments set is_helpful = true where id = cid;
  execute 'reset role';
end;
$$;

create function pg_temp.reputation(p_handle text)
returns integer
language sql
as $$ select reputation from public.profiles where handle = p_handle $$;

-- 001: farming with a second account ---------------------------------------
-- Alice marks twenty of bob's comments Helpful (the farming from issue 001).
select pg_temp.helpful('22222222-2222-4222-8222-222222222222', (select alice_track from ids))
from generate_series(1, 20);
select is(
  (select count(*)::int from public.comments where author_id = '22222222-2222-4222-8222-222222222222' and is_helpful),
  20, 'alice marked twenty comments Helpful'
);
select is(pg_temp.reputation('bob'), 3, 'one owner gives at most three reputation');

select pg_temp.helpful('22222222-2222-4222-8222-222222222222', (select carol_track from ids));
select is(pg_temp.reputation('bob'), 4, 'a second owner adds to it');

-- A two day old owner's mark waits until the account is a week old.
select pg_temp.helpful('22222222-2222-4222-8222-222222222222', (select eve_track from ids));
select is(pg_temp.reputation('bob'), 4, 'Helpful from an account younger than a week does not count yet');

select pg_temp.helpful('33333333-3333-4333-8333-333333333333', (select eve_track from ids));
select is(private.is_recent_giver('33333333-3333-4333-8333-333333333333'), false,
  'nor does it give the feed lift');

update public.profiles set created_at = now() - interval '8 days' where handle = 'eve';
select private.refresh_all_reputation();
select is(pg_temp.reputation('bob'), 5, 'it counts once the account is a week old (daily job)');
select is(private.is_recent_giver('33333333-3333-4333-8333-333333333333'), true,
  'and gives the feed lift');

-- Banning an owner removes the reputation their marks gave.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select public.admin_set_banned('33333333-3333-4333-8333-333333333333', true);
reset role;
select is(pg_temp.reputation('bob'), 4, 'Helpful from a banned owner does not count');

set local role authenticated;
select public.admin_set_banned('33333333-3333-4333-8333-333333333333', false);
reset role;
select is(pg_temp.reputation('bob'), 5, 'and counts again after the ban is lifted');

-- An admin removing the track takes its marks back; restoring returns them.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select public.admin_set_track_status((select alice_track from ids), 'deleted');
reset role;
select is(pg_temp.reputation('bob'), 2, 'Helpful on a removed track does not count');
set local role authenticated;
select public.admin_set_track_status((select alice_track from ids), 'live');
reset role;
select is(pg_temp.reputation('bob'), 5, 'and counts again when the track is restored');

-- 002: auto hide needs reporters with standing -----------------------------
create function pg_temp.report(p_user uuid, p_track uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.reports (target_type, track_id, reason) values ('track', p_track, 'spam');
  execute 'reset role';
end;
$$;

-- Three month old accounts without reputation (issue 002).
select pg_temp.make_user('66666666-6666-4666-8666-000000000001', 'sock1', interval '90 days');
select pg_temp.make_user('66666666-6666-4666-8666-000000000002', 'sock2', interval '90 days');
select pg_temp.make_user('66666666-6666-4666-8666-000000000003', 'sock3', interval '90 days');
select pg_temp.report(u, (select target from ids))
from unnest(array[
  '66666666-6666-4666-8666-000000000001',
  '66666666-6666-4666-8666-000000000002',
  '66666666-6666-4666-8666-000000000003'
]::uuid[]) u;
select is((select status::text from public.tracks where id = (select target from ids)), 'live',
  'three old accounts without reputation cannot auto hide');

-- Three accounts with reputation but younger than a week.
select pg_temp.make_user('77777777-7777-4777-8777-000000000001', 'young1', interval '3 days');
select pg_temp.make_user('77777777-7777-4777-8777-000000000002', 'young2', interval '3 days');
select pg_temp.make_user('77777777-7777-4777-8777-000000000003', 'young3', interval '3 days');
update public.profiles set reputation = 1 where handle in ('young1', 'young2', 'young3');
select pg_temp.report(u, (select target from ids))
from unnest(array[
  '77777777-7777-4777-8777-000000000001',
  '77777777-7777-4777-8777-000000000002',
  '77777777-7777-4777-8777-000000000003'
]::uuid[]) u;
select is((select status::text from public.tracks where id = (select target from ids)), 'live',
  'three accounts younger than a week cannot auto hide');

-- Bob and dave are a month old, eve is now eight days old; with
-- reputation all three count. Two are not enough, the third hides it.
update public.profiles set reputation = 1 where handle in ('dave', 'eve');
select pg_temp.report('22222222-2222-4222-8222-222222222222', (select target from ids));
select pg_temp.report('44444444-4444-4444-8444-444444444444', (select target from ids));
select is((select status::text from public.tracks where id = (select target from ids)), 'live',
  'two reporters with standing do not hide it');
select pg_temp.report('55555555-5555-4555-8555-555555555555', (select target from ids));
select is((select status::text from public.tracks where id = (select target from ids)), 'hidden',
  'three week old accounts with reputation hide it');

select is((select helpful_per_giver from public.trust_rules), 3, 'the rules come from src/config/reputation.ts');
select is(
  (select array_agg(privilege_type::text order by privilege_type::text) from information_schema.role_table_grants
   where table_name = 'trust_rules' and grantee = 'anon'),
  array['SELECT'], 'anon can only read the trust rules'
);

select * from finish();
rollback;
