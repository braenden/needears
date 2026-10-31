-- Moderation notices.
--
-- When an admin hides or removes a track or comment, its owner gets a
-- `moderation` notification with the reason. When an admin dismisses a
-- report, or restores what was reported (which dismisses the open reports),
-- the people who reported it get one too. The notice never names the
-- admin (actor_id stays empty). Bans stay silent: a shadow ban only works
-- when the banned person does not know.
--
-- The admin functions take an optional p_reason (at most 500 characters,
-- MODERATION_REASON_MAX in src/config/limits.ts). Calls without it keep
-- working and send the notice without a reason.

alter table public.notifications
  add column reason text check (char_length(reason) <= 500),
  add column target public.report_target;

alter table public.notifications add constraint notifications_moderation_target
  check (kind <> 'moderation' or target is not null);

create function private.notify_moderation(
  p_user uuid,
  p_target public.report_target,
  p_track uuid,
  p_comment uuid,
  p_reason text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, track_id, comment_id, target, reason)
  select p_user, 'moderation', p_track, p_comment, p_target, nullif(btrim(p_reason), '')
  where p_user is not null;
$$;

create function private.check_reason(p_reason text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
end;
$$;

drop function public.admin_set_track_status(uuid, public.track_status);
drop function public.admin_set_comment_status(uuid, public.comment_status);
drop function public.admin_resolve_report(uuid, public.report_status);

create function public.admin_set_track_status(
  p_track uuid,
  p_status public.track_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_status public.track_status;
  owner uuid;
begin
  perform private.require_admin();
  perform private.check_reason(p_reason);

  select status, owner_id into before_status, owner from public.tracks where id = p_track;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  update public.tracks set status = p_status where id = p_track;

  -- Helpful on a removed track does not count.
  perform private.refresh_reputation(marked.author_id)
  from (select distinct author_id from public.comments where track_id = p_track and is_helpful) marked;

  if p_status = 'live' then
    -- Restoring dismisses the open reports, and their reporters hear so.
    with dismissed as (
      update public.reports
      set status = 'dismissed', resolved_by = (select auth.uid()), resolved_at = now()
      where track_id = p_track and target_type = 'track' and status = 'open'
      returning reporter_id
    )
    insert into public.notifications (user_id, kind, track_id, target, reason)
    select distinct reporter_id, 'moderation'::public.notification_kind, p_track,
      'track'::public.report_target, nullif(btrim(p_reason), '')
    from dismissed where reporter_id is not null;
  elsif p_status in ('hidden', 'deleted') and p_status is distinct from before_status then
    perform private.notify_moderation(owner, 'track', p_track, null, p_reason);
  end if;
end;
$$;

create function public.admin_set_comment_status(
  p_comment uuid,
  p_status public.comment_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_status public.comment_status;
  author uuid;
  track uuid;
begin
  perform private.require_admin();
  perform private.check_reason(p_reason);

  select status, author_id, track_id into before_status, author, track
  from public.comments where id = p_comment;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  update public.comments set status = p_status where id = p_comment;

  if p_status = 'live' then
    with dismissed as (
      update public.reports
      set status = 'dismissed', resolved_by = (select auth.uid()), resolved_at = now()
      where comment_id = p_comment and target_type = 'comment' and status = 'open'
      returning reporter_id
    )
    insert into public.notifications (user_id, kind, track_id, comment_id, target, reason)
    select distinct reporter_id, 'moderation'::public.notification_kind, track, p_comment,
      'comment'::public.report_target, nullif(btrim(p_reason), '')
    from dismissed where reporter_id is not null;
  elsif p_status in ('hidden', 'deleted') and p_status is distinct from before_status then
    perform private.notify_moderation(author, 'comment', track, p_comment, p_reason);
  end if;
end;
$$;

create function public.admin_resolve_report(
  p_report uuid,
  p_status public.report_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  report public.reports;
  track uuid;
begin
  perform private.require_admin();
  perform private.check_reason(p_reason);

  select * into report from public.reports where id = p_report;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  update public.reports
  set status = p_status,
    resolved_by = case when p_status = 'open' then null else (select auth.uid()) end,
    resolved_at = case when p_status = 'open' then null else now() end
  where id = p_report;

  if p_status = 'dismissed' and report.status is distinct from 'dismissed' then
    track := coalesce(report.track_id, (select c.track_id from public.comments c where c.id = report.comment_id));
    perform private.notify_moderation(
      report.reporter_id, report.target_type, track, report.comment_id, p_reason
    );
  end if;
end;
$$;

revoke execute on function private.notify_moderation(uuid, public.report_target, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.check_reason(text) from public, anon, authenticated;
revoke execute on function public.admin_set_track_status(uuid, public.track_status, text) from public, anon;
revoke execute on function public.admin_set_comment_status(uuid, public.comment_status, text) from public, anon;
revoke execute on function public.admin_resolve_report(uuid, public.report_status, text) from public, anon;
grant execute on function public.admin_set_track_status(uuid, public.track_status, text) to authenticated;
grant execute on function public.admin_set_comment_status(uuid, public.comment_status, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, public.report_status, text) to authenticated;
