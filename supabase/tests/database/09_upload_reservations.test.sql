-- Storage uploads need a reservation from /api/upload/sign, so the public
-- buckets cannot be used as free file hosting.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
\ir _helpers.psql

create temp table reserved (object_id uuid);
grant select, insert on reserved to authenticated, service_role;

select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;

insert into reserved select public.reserve_upload();
select ok((select object_id from reserved) is not null, 'reserve_upload returns an object id');
select ok(
  public.can_upload_object('11111111-1111-4111-8111-111111111111/' || (select object_id from reserved) || '.mp3', '.mp3'),
  'the reserved key can be uploaded'
);
select ok(
  not public.can_upload_object('11111111-1111-4111-8111-111111111111/' || gen_random_uuid() || '.mp3', '.mp3'),
  'an unreserved key cannot'
);
select ok(
  not public.can_upload_object('11111111-1111-4111-8111-111111111111/' || (select object_id from reserved) || '.exe', '.mp3'),
  'the extension must match'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('audio', '11111111-1111-4111-8111-111111111111/' || gen_random_uuid() || '.mp3',
       '11111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'storage rejects an upload without a reservation'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('audio', '11111111-1111-4111-8111-111111111111/' || (select object_id from reserved) || '.mp3',
       '11111111-1111-4111-8111-111111111111') $$,
  'storage accepts the reserved upload'
);
-- Checked with has_function_privilege: calling a function without EXECUTE
-- after `set role` crashes the local Postgres 17.6 image in psql sessions
-- (not through PostgREST, which answers 401).
select ok(
  not has_function_privilege('authenticated', 'public.orphaned_upload_objects(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.forget_expired_upload_reservations()', 'execute'),
  'users cannot list orphaned files or forget reservations'
);
reset role;

-- Bob cannot use alice's reservation.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select ok(
  not public.can_upload_object('11111111-1111-4111-8111-111111111111/' || (select object_id from reserved) || '.mp3', '.mp3'),
  'reservations are per user'
);
-- Three reservations per allowed upload a day: 2 * 3 = 6 for a new account.
select lives_ok(
  $$ select public.reserve_upload() from generate_series(1, 6) $$,
  'a new account can reserve six uploads a day'
);
select throws_ok('select public.reserve_upload()', 'PT429', 'rate_limited', 'the seventh reservation is rate limited');
reset role;

select ok(not has_function_privilege('anon', 'public.reserve_upload(uuid)', 'execute'), 'anon cannot reserve uploads');

-- Creating the track uses up the reservation.
insert into storage.objects (bucket_id, name, owner_id)
select 'peaks', '11111111-1111-4111-8111-111111111111/' || object_id || '.json', '11111111-1111-4111-8111-111111111111'
from reserved;
set local role service_role;
insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key)
select '11111111-1111-4111-8111-111111111111', 'Reserved', 1, 5000,
  '11111111-1111-4111-8111-111111111111/' || object_id || '.mp3',
  '11111111-1111-4111-8111-111111111111/' || object_id || '.json'
from reserved;
reset role;
select is(
  (select count(*)::int from private.upload_reservations u join reserved r using (object_id)),
  0,
  'creating the track uses up the reservation'
);

-- A track without a valid reservation is refused.
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'c5555555-5555-4555-8555-555555555555');
update private.upload_reservations set expires_at = now() - interval '1 minute'
where object_id = 'c5555555-5555-4555-8555-555555555555';
set local role service_role;
select throws_ok(
  $$ insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key)
     values ('33333333-3333-4333-8333-333333333333', 'Late', 1, 5000,
       '33333333-3333-4333-8333-333333333333/c5555555-5555-4555-8555-555555555555.mp3',
       '33333333-3333-4333-8333-333333333333/c5555555-5555-4555-8555-555555555555.json') $$,
  '22023', 'upload_expired', 'a track needs a valid reservation'
);
reset role;

-- Orphaned files: old, unused and unreserved.
update storage.objects set created_at = now() - interval '4 hours'
where name like '%c5555555-5555-4555-8555-555555555555%'
  or name like '11111111-1111-4111-8111-111111111111/%';
select results_eq(
  $$ select name from public.orphaned_upload_objects(500)
     where name like '33333333-%' or name like '11111111-%' order by name $$,
  $$ values ('33333333-3333-4333-8333-333333333333/c5555555-5555-4555-8555-555555555555.json'),
            ('33333333-3333-4333-8333-333333333333/c5555555-5555-4555-8555-555555555555.mp3') $$,
  'cleanup finds files without a track or valid reservation, and leaves track files alone'
);

-- Banned users cannot reserve uploads.
update public.profiles set banned_at = now() where handle = 'carol';
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok('select public.reserve_upload()', '42501', 'not_allowed', 'banned users cannot reserve uploads');
reset role;

select * from finish();
rollback;
