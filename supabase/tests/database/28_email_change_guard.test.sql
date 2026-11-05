-- Asking for a new account email needs an email_change intent, which only
-- a recently signed in session gets (POST /api/account/identity-intent).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
\ir _helpers.psql

update auth.users set email_confirmed_at = now() - interval '30 days'
where id = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $$ update auth.users set email_change = 'thief@evil.example'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', 'email_change_requires_recent_sign_in',
  'a new email address needs a recent sign in'
);

select ok(
  not public.has_identity_intent('11111111-1111-4111-8111-111111111111', 'email_change', 'email', '5e550000-0000-4000-8000-000000000001'),
  'no open intent before one is made'
);
select public.create_identity_intent('11111111-1111-4111-8111-111111111111', 'email_change', 'email', '5e550000-0000-4000-8000-000000000001');
select ok(
  public.has_identity_intent('11111111-1111-4111-8111-111111111111', 'email_change', 'email', '5e550000-0000-4000-8000-000000000001'),
  'an unused intent is open, so a retry can reuse it'
);
select ok(
  not public.has_identity_intent('11111111-1111-4111-8111-111111111111', 'email_change', 'email',
    '5e550000-0000-4000-8000-000000000002'),
  'but only for the session that asked for it'
);
update private.identity_intents set expires_at = now() + interval '30 seconds'
where user_id = '11111111-1111-4111-8111-111111111111';
select ok(
  not public.has_identity_intent('11111111-1111-4111-8111-111111111111', 'email_change', 'email', '5e550000-0000-4000-8000-000000000001'),
  'and not when less than a minute is left'
);
update private.identity_intents set expires_at = now() + interval '5 minutes'
where user_id = '11111111-1111-4111-8111-111111111111';
select lives_ok(
  $$ update auth.users set email_change = 'alice.new@test.local'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  'with an intent the change can be asked for'
);
select ok(
  (select used_at is not null from private.identity_intents
   where user_id = '11111111-1111-4111-8111-111111111111' and action = 'email_change'),
  'and the intent is used up'
);
select lives_ok(
  $$ update auth.users set email_change = 'alice.new@test.local'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  'sending the link again for the same address needs no new intent'
);
select ok(
  not public.has_identity_intent('11111111-1111-4111-8111-111111111111', 'email_change', 'email', '5e550000-0000-4000-8000-000000000001')
    and not has_function_privilege('authenticated', 'public.has_identity_intent(uuid, text, text, uuid)', 'execute'),
  'a used intent is no longer open, and only the service role asks'
);
select throws_ok(
  $$ update auth.users set email_change = 'another@test.local'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', 'email_change_requires_recent_sign_in',
  'a second address needs a new intent'
);

select lives_ok(
  $$ update auth.users set email = 'alice.new@test.local', email_change = ''
     where id = '11111111-1111-4111-8111-111111111111' $$,
  'finishing the change needs nothing more'
);
select lives_ok(
  $$ update auth.users set email = 'bob.moved@test.local'
     where id = '22222222-2222-4222-8222-222222222222' $$,
  'a change made in the dashboard (the email set directly) is not affected'
);

-- A link intent does not open an email change.
select public.create_identity_intent('33333333-3333-4333-8333-333333333333', 'link', 'google');
select throws_ok(
  $$ update auth.users set email_change = 'carol.new@test.local'
     where id = '33333333-3333-4333-8333-333333333333' $$,
  '42501', 'email_change_requires_recent_sign_in',
  'only an email_change intent counts'
);

select * from finish();
rollback;
