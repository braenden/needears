-- Moderation notices.
--
-- When an admin hides or removes a track or comment, its owner gets a
-- `moderation` notification with the reason. When an admin dismisses a
-- report, or restores what was reported (which dismisses the open reports),
-- the people who reported it get one too. When an admin resolves a report
-- (it was acted on), the reporter hears so, and the owner of a post that
-- stays hidden gets a notice if they had none. The notice never names the
-- admin (actor_id stays empty). Bans stay silent: a shadow ban only works
-- when the banned person does not know.
--
-- The admin functions take an optional p_reason (at most 500 characters,
-- MODERATION_REASON_MAX in src/config/limits.ts). Calls without it keep
-- working and send the notice without a reason.

-- action says what the notice is about: the person's own post was hidden
-- or removed, or a report they sent was dismissed or acted on.
alter table public.notifications
  add column reason text check (char_length(reason) <= 500),
  add column target public.report_target,
  add column action text check (action in ('hidden', 'removed', 'report_dismissed', 'report_upheld'));

alter table public.notifications add constraint notifications_moderation_fields
  check (kind <> 'moderation' or (target is not null and action is not null));

create function private.clean_reason(p_reason text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_reason, E' \t\r\n'), '');
$$;

create function private.notify_moderation(
  p_user uuid,
  p_action text,
  p_target public.report_target,
  p_track uuid,
  p_comment uuid,
  p_reason text
)
returns void
language sql
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, action, track_id, comment_id, target, reason)
  select p_user, 'moderation', p_action, p_track, p_comment, p_target, private.clean_reason(p_reason)
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

  select status, owner_id into before_status, owner from public.tracks where id = p_track for update;
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
    insert into public.notifications (user_id, kind, action, track_id, target, reason)
    select distinct reporter_id, 'moderation'::public.notification_kind, 'report_dismissed', p_track,
      'track'::public.report_target, private.clean_reason(p_reason)
    from dismissed where reporter_id is not null;
  elsif p_status in ('hidden', 'deleted') and p_status is distinct from before_status then
    perform private.notify_moderation(
      owner, case when p_status = 'deleted' then 'removed' else 'hidden' end,
      'track', p_track, null, p_reason
    );
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
  from public.comments where id = p_comment for update;
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
    insert into public.notifications (user_id, kind, action, track_id, comment_id, target, reason)
    select distinct reporter_id, 'moderation'::public.notification_kind, 'report_dismissed', track, p_comment,
      'comment'::public.report_target, private.clean_reason(p_reason)
    from dismissed where reporter_id is not null;
  elsif p_status in ('hidden', 'deleted') and p_status is distinct from before_status then
    perform private.notify_moderation(
      author, case when p_status = 'deleted' then 'removed' else 'hidden' end,
      'comment', track, p_comment, p_reason
    );
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
  target_owner uuid;
begin
  perform private.require_admin();
  perform private.check_reason(p_reason);

  select * into report from public.reports where id = p_report for update;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  update public.reports
  set status = p_status,
    resolved_by = case when p_status = 'open' then null else (select auth.uid()) end,
    resolved_at = case when p_status = 'open' then null else now() end
  where id = p_report;

  track := coalesce(report.track_id, (select c.track_id from public.comments c where c.id = report.comment_id));

  if p_status = 'dismissed' and report.status is distinct from 'dismissed' then
    perform private.notify_moderation(
      report.reporter_id, 'report_dismissed', report.target_type, track, report.comment_id, p_reason
    );
  elsif p_status = 'resolved' and report.status is distinct from 'resolved' then
    -- The report was acted on: the reporter hears so, and the owner of a
    -- post that stays hidden (often auto hidden by reports) learns why,
    -- unless they already had a notice about it.
    perform private.notify_moderation(
      report.reporter_id, 'report_upheld', report.target_type, track, report.comment_id, p_reason
    );

    if report.target_type = 'track' then
      select owner_id into target_owner from public.tracks
      where id = report.track_id and status <> 'live';
    else
      select author_id into target_owner from public.comments
      where id = report.comment_id and status <> 'live';
    end if;

    if target_owner is not null and not exists (
      select 1 from public.notifications n
      where n.user_id = target_owner
        and n.kind = 'moderation'
        and n.action in ('hidden', 'removed')
        and n.target = report.target_type
        and n.track_id is not distinct from track
        and n.comment_id is not distinct from report.comment_id
    ) then
      perform private.notify_moderation(
        target_owner,
        case when (
          report.target_type = 'track'
          and (select status from public.tracks where id = report.track_id) = 'deleted'
        ) or (
          report.target_type = 'comment'
          and (select status from public.comments where id = report.comment_id) = 'deleted'
        ) then 'removed' else 'hidden' end,
        report.target_type, track, report.comment_id, p_reason
      );
    end if;
  end if;
end;
$$;

revoke execute on function private.clean_reason(text) from public, anon, authenticated;
revoke execute on function private.notify_moderation(uuid, text, public.report_target, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.check_reason(text) from public, anon, authenticated;
revoke execute on function public.admin_set_track_status(uuid, public.track_status, text) from public, anon;
revoke execute on function public.admin_set_comment_status(uuid, public.comment_status, text) from public, anon;
revoke execute on function public.admin_resolve_report(uuid, public.report_status, text) from public, anon;
grant execute on function public.admin_set_track_status(uuid, public.track_status, text) to authenticated;
grant execute on function public.admin_set_comment_status(uuid, public.comment_status, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, public.report_status, text) to authenticated;
