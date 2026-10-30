-- Profiles: created on sign up, handles validated, users can only change
-- their own profile and only the public fields.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
\ir _helpers.psql

select is(
  (select handle from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'alice',
  'a profile is created for a new auth user with the requested handle'
);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555',
    'authenticated', 'authenticated', 'secret.name@test.local', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-4666-8666-666666666666',
    'authenticated', 'authenticated', 'x@test.local', '{"handle": "Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-4777-8777-777777777777',
    'authenticated', 'authenticated', 'y@test.local', '{"handle": "alice"}', now(), now());

select unalike(
  (select handle from public.profiles where id = '55555555-5555-4555-8555-555555555555'),
  '%secret%',
  'the handle is never derived from the email address'
);
select isnt(
  (select handle from public.profiles where id = '66666666-6666-4666-8666-666666666666'),
  'admin',
  'a reserved handle in sign up metadata gets a suffix'
);
select alike(
  (select handle from public.profiles where id = '77777777-7777-4777-8777-777777777777'),
  'alice\_%',
  'a taken handle gets a suffix'
);

-- As alice ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ update public.profiles set display_name = 'Alice A', bio = 'Hi' where id = '11111111-1111-4111-8111-111111111111' $$,
  'a user can update their own profile'
);

update public.profiles set bio = 'hacked' where id = '22222222-2222-4222-8222-222222222222';

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'a user cannot make themselves admin'
);
select throws_ok(
  $$ update public.profiles set reputation = 999 where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'a user cannot set their own reputation'
);
select throws_ok(
  $$ update public.profiles set banned_at = null where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'a user cannot lift their own ban'
);
select throws_ok(
  $$ update public.profiles set handle = 'settings' where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'handle_reserved', 'reserved handles are rejected'
);
select throws_ok(
  $$ update public.profiles set handle = 'BOB' where id = '11111111-1111-4111-8111-111111111111' $$,
  '23505', null, 'handles are unique regardless of case'
);
select throws_ok(
  $$ update public.profiles set handle = 'a!' where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514', null, 'handles must match the allowed format'
);
select throws_ok(
  $$ delete from public.profiles where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'users cannot delete profiles directly'
);

reset role;
select is(
  (select bio from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  '',
  'a user cannot update someone else''s profile'
);

-- As anon -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select ok((select count(*) from public.profiles) >= 4, 'profiles are public');
reset role;

select * from finish();
rollback;
