-- Changing the account email needs a recent sign in, like adding or
-- removing a way to sign in.
--
-- Supabase Auth accepts an email change from any valid session, so a
-- stolen session could move the account to an address the thief controls
-- and keep it. Asking for a new address (auth.users.email_change being set)
-- now needs an email_change intent: POST /api/account/identity-intent makes
-- one after checking that the session making that request signed in within
-- the last 10 minutes, and the change uses it up. Without one the request
-- fails with email_change_requires_recent_sign_in.
--
-- Confirming the change, Supabase finishing it, sending the link again for
-- the same address, and changes made in the dashboard or with the admin
-- API's updateUserById (which set the email directly) are not affected. The
-- admin API's email change links (generateLink with email_change_current or
-- email_change_new) set email_change too, so they need an intent as well.

alter table private.identity_intents drop constraint identity_intents_action_check;
alter table private.identity_intents add constraint identity_intents_action_check
  check (action in ('link', 'unlink', 'email_change'));

create function private.users_email_change_requires_intent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.email_change, '') <> ''
    and new.email_change is distinct from old.email_change
    and not private.use_identity_intent(new.id, 'email_change', 'email')
  then
    raise exception 'email_change_requires_recent_sign_in' using errcode = '42501',
      detail = 'Sign in again to change your email address.';
  end if;
  return new;
end;
$$;

create trigger users_email_change_requires_recent_sign_in
  before update of email_change on auth.users
  for each row execute function private.users_email_change_requires_intent();

revoke execute on function private.users_email_change_requires_intent() from public, anon, authenticated;
