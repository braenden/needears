-- Small moderation and work bound fixes.
--
-- Removing a track (status deleted) also takes back the reputation its
-- Helpful marks gave.
--
-- Issue 010: restoring a hidden track or comment left its reports open, so
-- the next report hid it again at once. Setting a target back to live now
-- dismisses its open reports.
--
-- Issue 014: authors could rewrite a comment while it was hidden, before an
-- admin looked. Authors now edit only live comments.
--
-- Second review, same record rule for the paths that were missed:
-- owners edit only live tracks (a hidden track's title stays as reported),
-- authors cannot delete a comment with open reports (the reports would
-- cascade away), and DELETE /api/tracks/[id] refuses owners while the track
-- or a comment on it has open reports (track_under_review).
--
-- Second review: when a reporter deleted their account, their reports
-- cascaded away, so content they had auto hidden stayed hidden with nothing
-- in the admin queue. Reports now stay, without the reporter and without
-- the free text they wrote.
--
-- Issue 022: the feed functions capped the page size but not the page
-- number, so p_page could make OFFSET arbitrarily large. The page is now
-- capped at 50, like FEED_MAX_PAGE in src/config/limits.ts.

create or replace function public.admin_set_track_status(p_track uuid, p_status public.track_status)
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

  -- Helpful on a removed track does not count.
  perform private.refresh_reputation(marked.author_id)
  from (select distinct author_id from public.comments where track_id = p_track and is_helpful) marked;

  if p_status = 'live' then
    update public.reports
    set status = 'dismissed', resolved_by = (select auth.uid()), resolved_at = now()
    where track_id = p_track and target_type = 'track' and status = 'open';
  end if;
end;
$$;

create or replace function public.admin_set_comment_status(p_comment uuid, p_status public.comment_status)
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

  if p_status = 'live' then
    update public.reports
    set status = 'dismissed', resolved_by = (select auth.uid()), resolved_at = now()
    where comment_id = p_comment and target_type = 'comment' and status = 'open';
  end if;
end;
$$;

-- The free text was written by the deleted person, so it goes; the target,
-- the reason and the status stay as the record.
create function private.reports_forget_reporter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.reporter_id is not null and new.reporter_id is null then
    new.details := '';
  end if;
  return new;
end;
$$;

revoke execute on function private.reports_forget_reporter() from public, anon, authenticated;

create trigger reports_forget_reporter
  before update of reporter_id on public.reports
  for each row execute function private.reports_forget_reporter();

alter table public.reports alter column reporter_id drop not null;
alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles (id) on delete set null;

drop policy "Owners edit their own tracks" on public.tracks;
create policy "Owners edit their own live tracks" on public.tracks
  for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'live')
  with check (owner_id = (select auth.uid()));

-- Open reports on a track or on any comment on it. Used by the track delete
-- route (service role) before an owner deletes a track.
create function public.track_under_review(p_track uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
    where r.status = 'open'
      and (r.track_id = p_track
        or r.comment_id in (select c.id from public.comments c where c.track_id = p_track))
  );
$$;

revoke execute on function public.track_under_review(uuid) from public, anon, authenticated;
grant execute on function public.track_under_review(uuid) to service_role;

-- Authors cannot delete a comment while it has open reports. Admins can,
-- and deletes that do not come from a signed in user (cascades from a track
-- or account deletion by the service role or Auth) are not affected.
create function private.comments_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()) ->> 'role', '') = 'authenticated'
    and not public.is_admin()
    and exists (select 1 from public.reports where comment_id = old.id and status = 'open')
  then
    raise exception 'not_allowed' using errcode = '42501',
      detail = 'This comment is under review and cannot be deleted now.';
  end if;
  return old;
end;
$$;

revoke execute on function private.comments_before_delete() from public, anon, authenticated;

create trigger comments_before_delete
  before delete on public.comments
  for each row execute function private.comments_before_delete();

drop policy "Authors edit their own comments" on public.comments;
create policy "Authors edit their own live comments" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()) and status = 'live')
  with check (author_id = (select auth.uid()));

create or replace function public.feed_needs_ears(
  p_genre text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns setof public.tracks
language sql
stable
set search_path = ''
as $$
  select t.*
  from public.tracks t
  where t.status = 'live'
    and t.comment_count <= 1
    and (p_genre is null or t.genre_id = (select g.id from public.genres g where g.slug = p_genre))
  order by t.published_at desc, t.id
  limit least(greatest(p_page_size, 1), 50)
  offset (least(greatest(p_page, 1), 50) - 1) * least(greatest(p_page_size, 1), 50);
$$;

-- Latest: newest first, with tracks from recent givers treated as if they
-- were published six hours later.
create or replace function public.feed_latest(
  p_genre text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns setof public.tracks
language sql
stable
security definer
set search_path = ''
as $$
  select t.*
  from public.tracks t
  where t.status = 'live'
    and (p_genre is null or t.genre_id = (select g.id from public.genres g where g.slug = p_genre))
  order by
    t.published_at
      + case when private.is_recent_giver(t.owner_id) then interval '6 hours' else interval '0' end
      desc,
    t.id
  limit least(greatest(p_page_size, 1), 50)
  offset (least(greatest(p_page, 1), 50) - 1) * least(greatest(p_page_size, 1), 50);
$$;

-- Trending: activity in the last 7 days. Each comment counts 2 and each
-- reaction 1, and every event decays with a half life of 48 hours. The
-- owner's own comments and reactions do not count. The score is divided by
-- the track's age so old tracks do not stay on top, and recent givers get
-- a 20 percent lift.
--
-- Security definer because reactions are private per user. It only returns
-- live tracks and aggregate scores, never who reacted.
create or replace function public.feed_trending(
  p_genre text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns setof public.tracks
language sql
stable
security definer
set search_path = ''
as $$
  with events as (
    select c.track_id, 2.0 as weight, c.created_at
    from public.comments c
    join public.tracks t on t.id = c.track_id
    where c.created_at > now() - interval '7 days'
      and c.status = 'live'
      and c.author_id <> t.owner_id
    union all
    select r.track_id, 1.0 as weight, r.created_at
    from public.reactions r
    join public.tracks t on t.id = r.track_id
    where r.created_at > now() - interval '7 days'
      and r.user_id <> t.owner_id
  ),
  activity as (
    select
      track_id,
      sum(weight * power(0.5, extract(epoch from now() - created_at) / (48 * 3600))) as score
    from events
    group by track_id
  )
  select t.*
  from public.tracks t
  join activity a on a.track_id = t.id
  where t.status = 'live'
    and (p_genre is null or t.genre_id = (select g.id from public.genres g where g.slug = p_genre))
  order by
    a.score
      * case when private.is_recent_giver(t.owner_id) then 1.2 else 1.0 end
      / power(extract(epoch from now() - t.published_at) / 3600 + 2, 0.5)
      desc,
    t.published_at desc,
    t.id
  limit least(greatest(p_page_size, 1), 50)
  offset (least(greatest(p_page, 1), 50) - 1) * least(greatest(p_page_size, 1), 50);
$$;

