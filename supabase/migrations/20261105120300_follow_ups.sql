-- Two small follow ups.
--
-- 1. A withdrawn comment is public as a gap in its thread, so it keeps
--    nothing about its author: also when it was edited and first marked
--    Helpful goes. Whether the thread is resolved is the artist's and
--    stays (a withdrawn row cannot be resolved again).
-- 2. Intents remember the session that asked for them. has_identity_intent()
--    tells POST /api/account/identity-intent that this session still has
--    an unused email change intent with time left, so its retry does not
--    sign the account's other sessions out again. Any other session goes
--    the usual way and signs out the rest.

create or replace function public.delete_comment(p_comment uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  admin boolean := public.is_admin();
  c public.comments;
begin
  if uid is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into c from public.comments where id = p_comment for update;
  if c.id is null
    or (not admin and (c.author_id <> uid or c.status <> 'live'))
    or (admin and c.status = 'withdrawn')
  then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not admin
    and exists (select 1 from public.reports where comment_id = c.id and status = 'open')
  then
    raise exception 'not_allowed' using errcode = '42501',
      detail = 'This comment is under review and cannot be deleted now.';
  end if;

  if exists (select 1 from public.comments r where r.parent_id = c.id) then
    -- Moderated comments with replies stay as they are.
    if c.status <> 'live' then
      raise exception 'has_replies' using errcode = '22023',
        detail = 'This comment has replies. Hide it instead.';
    end if;
    perform set_config('needears.withdrawing', c.id::text, true);
    update public.comments
    set status = 'withdrawn', body = '', author_id = null,
      is_helpful = false, helpful_at = null, first_helpful_at = null,
      edited_at = null
    where id = c.id;
    perform set_config('needears.withdrawing', '', true);
    -- The trigger only knows the row as it is now, without its author.
    perform private.refresh_reputation(c.author_id);
    -- Nobody is pointed at text that is gone.
    delete from public.notifications
    where comment_id = c.id and kind in ('comment', 'reply', 'helpful');
    return 'withdrawn';
  end if;

  perform set_config('needears.deleting', c.id::text, true);
  delete from public.comments where id = c.id;
  perform set_config('needears.deleting', '', true);
  return 'deleted';
end;
$$;

-- 2. An open intent for this session ---------------------------------------

alter table private.identity_intents add column session_id uuid;

drop function public.create_identity_intent(uuid, text, text);

-- As before, and remembers the asking session.
create function public.create_identity_intent(
  p_user uuid,
  p_action text,
  p_provider text,
  p_session uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('identity_intent:' || p_user::text, 0));

  if (
    select count(*) from private.identity_intents
    where user_id = p_user and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'rate_limited' using errcode = 'PT429',
      hint = 'Try again in an hour.';
  end if;

  delete from private.identity_intents
  where user_id = p_user and created_at < now() - interval '1 day';

  -- A linking flow started earlier (OAuth authorize, valid for minutes and
  -- tied to no session) could otherwise finish with this intent after the
  -- session that started it was signed out. Only the fresh session can
  -- start a new one.
  delete from auth.flow_state where linking_target_id = p_user;

  insert into private.identity_intents (user_id, action, provider, session_id)
  values (p_user, p_action, p_provider, p_session);
end;
$$;

-- True when `p_session` has an unused intent for this action with at least
-- a minute left.
create function public.has_identity_intent(
  p_user uuid,
  p_action text,
  p_provider text,
  p_session uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.identity_intents i
    where i.user_id = p_user
      and i.action = p_action
      and i.provider = p_provider
      and i.session_id = p_session
      and i.used_at is null
      and i.expires_at > now() + interval '1 minute'
  );
$$;

revoke execute on function public.delete_comment(uuid) from public, anon;
grant execute on function public.delete_comment(uuid) to authenticated, service_role;
revoke execute on function public.create_identity_intent(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_identity_intent(uuid, text, text, uuid) to service_role;
revoke execute on function public.has_identity_intent(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.has_identity_intent(uuid, text, text, uuid) to service_role;
