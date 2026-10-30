-- Deleting an account leaves no personal data behind, other people's
-- replies survive, and upload IPs are purged after 30 days.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
\ir _helpers.psql

-- Alice has a track with an upload IP, comments, reactions, reports and
-- notifications, and has been marked Helpful on bob's track.
create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as alice_track,
  pg_temp.make_track('22222222-2222-4222-8222-222222222222') as bob_track;

insert into public.track_upload_ips (track_id, ip) select alice_track, '203.0.113.7' from ids;

insert into public.comments (id, track_id, author_id, body)
select 'c0000000-0000-4000-8000-0000000000a1'::uuid, bob_track, '11111111-1111-4111-8111-111111111111'::uuid, 'Alice on bob' from ids
union all
select 'c0000000-0000-4000-8000-0000000000b1'::uuid, alice_track, '22222222-2222-4222-8222-222222222222'::uuid, 'Bob on alice' from ids;
insert into public.comments (track_id, author_id, parent_id, body)
select bob_track, '33333333-3333-4333-8333-333333333333', 'c0000000-0000-4000-8000-0000000000a1', 'Carol replies'
from ids;
update public.comments set is_helpful = true where id = 'c0000000-0000-4000-8000-0000000000a1';

insert into public.reactions (track_id, user_id, kind)
select bob_track, '11111111-1111-4111-8111-111111111111'::uuid, 'fire'::public.reaction_kind from ids
union all
select alice_track, '22222222-2222-4222-8222-222222222222', 'heart' from ids;

insert into public.reports (reporter_id, target_type, track_id, reason, details)
select '11111111-1111-4111-8111-111111111111', 'track', bob_track, 'other', 'Alice wrote this' from ids;

select ok(
  (select count(*) from public.notifications
   where user_id = '11111111-1111-4111-8111-111111111111'
     or actor_id = '11111111-1111-4111-8111-111111111111') > 0,
  'alice has notifications before deletion'
);

-- What /api/account/delete does after removing her storage objects.
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';

-- Search every column of every table for her id, handle or the text she wrote.
create function pg_temp.rows_mentioning(p_needle text)
returns integer
language plpgsql
as $$
declare
  t record;
  hits integer;
  total integer := 0;
begin
  for t in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private', 'auth') and c.relkind = 'r'
  loop
    execute format('select count(*) from %I.%I x where x::text ilike %L', t.nspname, t.relname, '%' || p_needle || '%')
    into hits;
    total := total + hits;
  end loop;
  return total;
end;
$$;

select is(pg_temp.rows_mentioning('11111111-1111-4111-8111-111111111111'), 0, 'no row anywhere contains her user id');
select is(pg_temp.rows_mentioning('alice'), 0, 'no row contains her handle, email or text');
select is(
  (select count(*)::int from public.reports where reporter_id is null and details = ''),
  1, 'her report stays as a record, without her and her text'
);
select is(pg_temp.rows_mentioning('203.0.113.7'), 0, 'her upload IP is gone');
select is(
  (select parent_id from public.comments where body = 'Carol replies'),
  null,
  'replies to her comments survive as top level comments'
);
select is(
  (select comment_count from public.tracks where id = (select bob_track from ids)),
  1,
  'counters are updated after the deletion'
);

-- Upload IP purge -----------------------------------------------------------
insert into public.track_upload_ips (track_id, ip, created_at)
select bob_track, '198.51.100.9', now() - interval '31 days' from ids;
create temp table recent as select pg_temp.make_track('33333333-3333-4333-8333-333333333333') as id;
insert into public.track_upload_ips (track_id, ip, created_at)
select id, '198.51.100.10', now() - interval '29 days' from recent;

select private.purge_expired_data();

select is(pg_temp.rows_mentioning('198.51.100.9'), 0, 'upload IPs older than 30 days are deleted');
select is(pg_temp.rows_mentioning('198.51.100.10'), 1, 'newer upload IPs are kept');

select * from finish();
rollback;
