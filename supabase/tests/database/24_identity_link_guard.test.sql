-- Adding or removing a way to sign in needs a recent sign in, the last one
-- cannot be removed, and the person is emailed about the change.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
\ir _helpers.psql

-- alice has a confirmed email and signed up with it.
update auth.users set email_confirmed_at = now() - interval '30 days'
where id = '11111111-1111-4111-8111-111111111111';

create function pg_temp.add_identity(p_user uuid, p_provider text, p_email text)
returns void
language sql
as $$
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (gen_random_uuid()::text, p_user, jsonb_build_object('sub', gen_random_uuid(), 'email', p_email),
    p_provider, now(), now());
$$;

-- A session for the user whose sign in proof is p_age old.
create function pg_temp.add_session(p_user uuid, p_age interval, p_not_after timestamptz default null)
returns void
language plpgsql
as $$
declare
  sid uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
  values (sid, p_user, now() - p_age, now() - p_age, p_not_after);
  insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method)
  values (gen_random_uuid(), sid, now() - p_age, now() - p_age, 'otp');
end;
$$;

-- Adding ---------------------------------------------------------------------
select lives_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'email', 'alice@test.local') $$,
  'the first identity of a user goes through'
);
select is(
  (select count(*)::int from public.email_queue where user_id = '11111111-1111-4111-8111-111111111111' and kind is not null),
  0,
  'signing up sends no security email'
);
select lives_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', ' Alice@Test.Local ') $$,
  'an identity with the user''s own confirmed email goes through without a recent sign in'
);
select throws_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', 'attacker@evil.example') $$,
  '42501', 'identity_link_requires_recent_sign_in',
  'another email needs a recent sign in'
);

select pg_temp.add_session('11111111-1111-4111-8111-111111111111', interval '20 minutes');
select throws_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', 'attacker@evil.example') $$,
  '42501', 'identity_link_requires_recent_sign_in',
  'a sign in 20 minutes ago is not recent'
);
select pg_temp.add_session('11111111-1111-4111-8111-111111111111', interval '1 minute', now() - interval '1 second');
select throws_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', 'attacker@evil.example') $$,
  '42501', 'identity_link_requires_recent_sign_in',
  'an expired session does not count'
);
select pg_temp.add_session('11111111-1111-4111-8111-111111111111', interval '1 minute');
select lives_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', 'alice.music@gmail.com') $$,
  'with a sign in a minute ago, another email goes through'
);

-- bob's email is not confirmed: his own address does not count as proof.
select pg_temp.add_identity('22222222-2222-4222-8222-222222222222', 'email', 'bob@test.local');
select throws_ok(
  $$ select pg_temp.add_identity('22222222-2222-4222-8222-222222222222', 'google', 'bob@test.local') $$,
  '42501', 'identity_link_requires_recent_sign_in',
  'an unconfirmed email is not proof'
);

select results_eq(
  $$ select kind, payload ->> 'provider', payload ->> 'email' from public.email_queue
     where user_id = '11111111-1111-4111-8111-111111111111' and kind is not null order by id $$,
  $$ values ('identity_linked', 'google', ' Alice@Test.Local '), ('identity_linked', 'google', 'alice.music@gmail.com') $$,
  'each added way to sign in is emailed'
);

-- Removing -------------------------------------------------------------------
select throws_ok(
  $$ delete from auth.identities where user_id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', 'identity_unlink_last',
  'the last way to sign in cannot be removed'
);

-- carol has two identities and no recent sign in.
select pg_temp.add_identity('33333333-3333-4333-8333-333333333333', 'email', 'carol@test.local');
select pg_temp.add_session('33333333-3333-4333-8333-333333333333', interval '1 minute');
select pg_temp.add_identity('33333333-3333-4333-8333-333333333333', 'google', 'carol.beats@gmail.com');
delete from auth.mfa_amr_claims c using auth.sessions s
where c.session_id = s.id and s.user_id = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  $$ delete from auth.identities where user_id = '33333333-3333-4333-8333-333333333333' and provider = 'google' $$,
  '42501', 'identity_unlink_requires_recent_sign_in',
  'removing a way to sign in needs a recent sign in'
);
select pg_temp.add_session('33333333-3333-4333-8333-333333333333', interval '1 minute');
select lives_ok(
  $$ delete from auth.identities where user_id = '33333333-3333-4333-8333-333333333333' and provider = 'google' $$,
  'with a recent sign in it can be removed'
);
select is(
  (select count(*)::int from public.email_queue
   where user_id = '33333333-3333-4333-8333-333333333333' and kind = 'identity_unlinked'),
  1,
  'removing is emailed'
);

-- Security emails ------------------------------------------------------------
update public.profiles set email_notifications = false where handle = 'carol';
set local role service_role;
select is(
  (select count(*)::int from public.email_batch(20, 60) where user_id in (
    '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')),
  0,
  'the digest leaves security emails alone'
);
select is(
  (select count(*)::int from public.security_email_batch(20)),
  4,
  'security emails are sent whatever the notification setting'
);
reset role;
select ok(
  not has_function_privilege('authenticated', 'public.security_email_batch(integer)', 'execute')
    and not has_function_privilege('anon', 'public.security_email_batch(integer)', 'execute'),
  'only the service role reads security emails'
);

-- Deleting the account still works and leaves nothing queued.
delete from auth.users where id = '33333333-3333-4333-8333-333333333333';
select is(
  (select count(*)::int from public.email_queue where user_id = '33333333-3333-4333-8333-333333333333'),
  0,
  'deleting the account removes identities and queued emails'
);

select * from finish();
rollback;
