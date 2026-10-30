-- Admin moderation functions and scheduled cleanup.
--
-- Moderation goes through these functions instead of update grants, so an
-- owner can never flip their own hidden track back to live. Each function
-- checks is_admin() itself.

create function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501',
      detail = 'Admin only.';
  end if;
end;
$$;

create function public.admin_set_track_status(p_track uuid, p_status public.track_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.tracks set status = p_status where id = p_track;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;
end;
$$;

create function public.admin_set_comment_status(p_comment uuid, p_status public.comment_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.comments set status = p_status where id = p_comment;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;
end;
$$;

create function public.admin_resolve_report(p_report uuid, p_status public.report_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.reports
  set status = p_status,
    resolved_by = case when p_status = 'open' then null else (select auth.uid()) end,
    resolved_at = case when p_status = 'open' then null else now() end
  where id = p_report;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;
end;
$$;

-- Shadow ban. Banning hides everything the user has posted; new posts are
-- hidden by the insert triggers. Lifting the ban does not unhide old content,
-- an admin restores what should come back.
create function public.admin_set_banned(p_user uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user = (select auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501',
      detail = 'You cannot ban yourself.';
  end if;

  update public.profiles
  set banned_at = case when p_banned then coalesce(banned_at, now()) end
  where id = p_user;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  if p_banned then
    update public.tracks set status = 'hidden' where owner_id = p_user and status = 'live';
    update public.comments set status = 'hidden' where author_id = p_user and status = 'live';
  end if;
end;
$$;

revoke execute on function private.require_admin() from public, anon, authenticated;
revoke execute on function public.admin_set_track_status(uuid, public.track_status) from public, anon;
revoke execute on function public.admin_set_comment_status(uuid, public.comment_status) from public, anon;
revoke execute on function public.admin_resolve_report(uuid, public.report_status) from public, anon;
revoke execute on function public.admin_set_banned(uuid, boolean) from public, anon;
grant execute on function public.admin_set_track_status(uuid, public.track_status) to authenticated;
grant execute on function public.admin_set_comment_status(uuid, public.comment_status) to authenticated;
grant execute on function public.admin_resolve_report(uuid, public.report_status) to authenticated;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;

-- Scheduled cleanup --------------------------------------------------------

-- Upload IPs are kept for 30 days for takedown tracing (see the privacy
-- policy), and the rate limit ledger only needs the last week.
create function private.purge_expired_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.track_upload_ips where created_at < now() - interval '30 days';
  delete from private.rate_limit_events where created_at < now() - interval '8 days';
$$;

revoke execute on function private.purge_expired_data() from public, anon, authenticated;

select cron.schedule('purge-expired-data', '17 3 * * *', 'select private.purge_expired_data()');
