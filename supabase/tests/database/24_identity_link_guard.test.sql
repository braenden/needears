-- Adding or removing a way to sign in needs a one time intent from a
-- session that signed in recently, the last one cannot be removed, the
-- email one stays a day after a new link, passwords are not kept, and the
-- owner is emailed at the address from before the change.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);
\ir _helpers.psql

-- alice and carol have confirmed emails; bob's is not confirmed yet.
update auth.users set email_confirmed_at = now() - interval '30 days'
where id in ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');

create function pg_temp.add_identity(p_user uuid, p_provider text, p_email text, p_verified boolean default true)
returns void
language sql
as $$
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (gen_random_uuid()::text, p_user,
    jsonb_build_object('sub', gen_random_uuid(), 'email', p_email, 'email_verified', p_verified),
    p_provider, now(), now());
$$;

-- A session that signed in a minute ago (what made the old design pass).
create function pg_temp.add_fresh_session(p_user uuid)
returns void
language plpgsql
as $$
declare
  sid uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, p_user, now(), now());
  insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method)
  values (gen_random_uuid(), sid, now(), now(), 'oauth');
end;
$$;

create function pg_temp.intent(p_user uuid, p_action text, p_provider text)
returns void
language sql
as $$
  select public.create_identity_intent(p_user, p_action, p_provider);
$$;

-- Adding ---------------------------------------------------------------------
select lives_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'email', 'alice@test.local') $$,
  'the first identity of a user goes through'
);
select lives_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', ' Alice@Test.Local ') $$,
  'the account''s own email, verified by the provider, goes through without an intent'
);
select throws_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'github', 'alice@test.local', false) $$,
  '42501', 'identity_link_requires_recent_sign_in',
  'the same email unverified needs an intent'
);

-- The attack: some other session of alice signed in a minute ago, and the
-- attacker's session links without going through the intent route.
select pg_temp.add_fresh_session('11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', 'attacker@evil.example') $$,
  '42501', 'identity_link_requires_recent_sign_in',
  'a fresh sign in on another session does not open linking'
);

select pg_temp.intent('11111111-1111-4111-8111-111111111111', 'unlink', 'google');
select pg_temp.intent('11111111-1111-4111-8111-111111111111', 'link', 'github');
select throws_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', 'alice.music@gmail.com') $$,
  '42501', 'identity_link_requires_recent_sign_in',
  'an intent is for one action and provider'
);
select pg_temp.intent('11111111-1111-4111-8111-111111111111', 'link', 'google');
select lives_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', 'alice.music@gmail.com') $$,
  'with an intent, linking goes through'
);
select throws_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', 'alice.second@gmail.com') $$,
  '42501', 'identity_link_requires_recent_sign_in',
  'an intent is used once'
);
select pg_temp.intent('11111111-1111-4111-8111-111111111111', 'link', 'google');
update private.identity_intents set expires_at = now() - interval '1 second'
where user_id = '11111111-1111-4111-8111-111111111111' and used_at is null and action = 'link' and provider = 'google';
select throws_ok(
  $$ select pg_temp.add_identity('11111111-1111-4111-8111-111111111111', 'google', 'alice.second@gmail.com') $$,
  '42501', 'identity_link_requires_recent_sign_in',
  'an intent expires'
);

-- bob's email is not confirmed yet. Google for the same verified address
-- takes the account over, as Supabase does, without security emails.
select pg_temp.add_identity('22222222-2222-4222-8222-222222222222', 'email', 'bob@test.local');
select lives_ok(
  $$ select pg_temp.add_identity('22222222-2222-4222-8222-222222222222', 'google', 'bob@test.local') $$,
  'Google for the same verified email goes through on an unconfirmed account'
);
select lives_ok(
  $$ delete from auth.identities where user_id = '22222222-2222-4222-8222-222222222222' and provider = 'email' $$,
  'Supabase can remove the unconfirmed email identity afterwards'
);
select is(
  (select count(*)::int from public.email_queue where user_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'taking over an unconfirmed sign up sends no security email'
);

-- Removing -------------------------------------------------------------------
update auth.users set email_confirmed_at = now() - interval '1 day' where id = '22222222-2222-4222-8222-222222222222';
select throws_ok(
  $$ delete from auth.identities where user_id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', 'identity_unlink_last',
  'the last way to sign in cannot be removed'
);

-- carol has an email identity and a Google one, linked two days ago.
select pg_temp.add_identity('33333333-3333-4333-8333-333333333333', 'email', 'carol@test.local');
select pg_temp.intent('33333333-3333-4333-8333-333333333333', 'link', 'google');
select pg_temp.add_identity('33333333-3333-4333-8333-333333333333', 'google', 'carol.beats@gmail.com');
update auth.identities set created_at = now() - interval '2 days' where user_id = '33333333-3333-4333-8333-333333333333';
select pg_temp.add_fresh_session('33333333-3333-4333-8333-333333333333');
select throws_ok(
  $$ delete from auth.identities where user_id = '33333333-3333-4333-8333-333333333333' and provider = 'google' $$,
  '42501', 'identity_unlink_requires_recent_sign_in',
  'removing needs an intent, a fresh session elsewhere is not enough'
);
select pg_temp.intent('33333333-3333-4333-8333-333333333333', 'unlink', 'google');
select lives_ok(
  $$ delete from auth.identities where user_id = '33333333-3333-4333-8333-333333333333' and provider = 'google' $$,
  'with an intent it can be removed'
);

-- A new link keeps the email identity in place for a day.
select pg_temp.intent('33333333-3333-4333-8333-333333333333', 'link', 'google');
select pg_temp.add_identity('33333333-3333-4333-8333-333333333333', 'google', 'attacker@evil.example');
select pg_temp.intent('33333333-3333-4333-8333-333333333333', 'unlink', 'email');
select throws_ok(
  $$ delete from auth.identities where user_id = '33333333-3333-4333-8333-333333333333' and provider = 'email' $$,
  '42501', 'identity_unlink_too_soon',
  'the identity with the account email stays a day after a new link'
);

-- Security emails go to the address from before the change ------------------
-- What Supabase does after an email identity is removed: the account
-- email follows the remaining identity.
update auth.identities set created_at = now() - interval '2 days' where user_id = '33333333-3333-4333-8333-333333333333';
delete from public.email_queue where user_id = '33333333-3333-4333-8333-333333333333';
delete from auth.identities where user_id = '33333333-3333-4333-8333-333333333333' and provider = 'email';
update auth.users set email = 'attacker@evil.example' where id = '33333333-3333-4333-8333-333333333333';
select results_eq(
  $$ select kind, recipient from public.email_queue where user_id = '33333333-3333-4333-8333-333333333333' $$,
  $$ values ('identity_unlinked', 'carol@test.local') $$,
  'the email is addressed to the account email from before the change'
);
set local role service_role;
select is(
  (select array(select unnest(recipients) order by 1)
   from public.security_email_batch(20, 60) where user_id = '33333333-3333-4333-8333-333333333333'),
  array['attacker@evil.example', 'carol@test.local'],
  'and also to the current address when it has moved'
);
reset role;

-- Supabase confirming an email change adds an email identity for the new
-- address; that needs no intent.
select pg_temp.add_identity('44444444-4444-4444-8444-444444444444', 'google', 'dave@test.local');
update auth.users set email_change = 'dave.new@test.local', email_confirmed_at = now() - interval '30 days'
where id = '44444444-4444-4444-8444-444444444444';
select lives_ok(
  $$ select pg_temp.add_identity('44444444-4444-4444-8444-444444444444', 'email', 'dave.new@test.local') $$,
  'confirming an email change can add the new email identity'
);

-- Passwords ------------------------------------------------------------------
select throws_ok(
  $$ update auth.users set encrypted_password = 'x' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', 'password_sign_in_disabled',
  'a password cannot be set'
);
select lives_ok(
  $$ update auth.users set encrypted_password = null where id = '11111111-1111-4111-8111-111111111111' $$,
  'a password can be cleared'
);
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555', 'authenticated',
  'authenticated', 'new@test.local', 'random-from-sign-up', '{"handle": "newbie"}', now(), now());
select is(
  (select encrypted_password from auth.users where id = '55555555-5555-4555-8555-555555555555'),
  null,
  'a new account keeps no password'
);

-- Limits and the rest --------------------------------------------------------
select throws_ok(
  $$ select pg_temp.intent('11111111-1111-4111-8111-111111111111', 'link', 'google')
     from generate_series(1, 10) $$,
  'PT429', 'rate_limited',
  'ten intents an hour'
);
select is(
  (select count(*)::int from public.email_queue where user_id = '11111111-1111-4111-8111-111111111111' and kind is not null),
  2,
  'each added way to sign in is emailed'
);
update public.profiles set email_notifications = false where handle = 'alice';
update public.email_queue set claimed_at = null;
set local role service_role;
select is(
  (select count(*)::int from public.email_batch(20, 60) where user_id = '11111111-1111-4111-8111-111111111111'),
  0,
  'the digest leaves security emails alone'
);
select is(
  (select count(*)::int from public.security_email_batch(20, 60) where user_id = '11111111-1111-4111-8111-111111111111'),
  2,
  'security emails are sent whatever the notification setting'
);
reset role;
select ok(
  not has_function_privilege('authenticated', 'public.create_identity_intent(uuid, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.create_identity_intent(uuid, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.security_email_batch(integer, integer)', 'execute')
    and not has_table_privilege('authenticated', 'private.identity_intents', 'select'),
  'only the service role creates intents and reads security emails'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'identities_require_recent_sign_in' and tgrelid = 'auth.identities'::regclass)
    and exists (select 1 from pg_trigger where tgname = 'identities_require_recent_sign_in_delete' and tgrelid = 'auth.identities'::regclass)
    and exists (select 1 from pg_trigger where tgname = 'identities_notify' and tgrelid = 'auth.identities'::regclass)
    and exists (select 1 from pg_trigger where tgname = 'users_no_password' and tgrelid = 'auth.users'::regclass),
  'the guards are in place on the auth tables'
);

-- Deleting the account still works and leaves nothing queued.
delete from auth.users where id = '33333333-3333-4333-8333-333333333333';
select is(
  (select count(*)::int from public.email_queue where user_id = '33333333-3333-4333-8333-333333333333')
    + (select count(*)::int from auth.identities where user_id = '33333333-3333-4333-8333-333333333333'),
  0,
  'deleting the account removes identities and queued emails'
);

select * from finish();
rollback;
