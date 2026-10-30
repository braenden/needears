-- Row level security and grants.
--
-- RLS decides which rows a role can touch, column grants decide which
-- columns. Supabase grants everything on new tables to anon and
-- authenticated by default, so we start from nothing and grant back only
-- what the API needs. Tracks are never inserted by end users directly:
-- /api/tracks verifies the uploaded objects first and inserts with the
-- service role.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.genres enable row level security;
alter table public.reputation_levels enable row level security;
alter table public.reserved_handles enable row level security;
alter table public.tracks enable row level security;
alter table public.track_upload_ips enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table private.rate_limit_events enable row level security;

-- Reference data -----------------------------------------------------------

grant select on public.genres, public.reputation_levels, public.reserved_handles
  to anon, authenticated;

create policy "Genres are public" on public.genres
  for select to anon, authenticated using (true);

create policy "Reputation levels are public" on public.reputation_levels
  for select to anon, authenticated using (true);

create policy "Reserved handles are public" on public.reserved_handles
  for select to anon, authenticated using (true);

-- Profiles -----------------------------------------------------------------

grant select on public.profiles to anon, authenticated;
grant update (handle, display_name, avatar_url, bio) on public.profiles to authenticated;

create policy "Profiles are public" on public.profiles
  for select to anon, authenticated using (true);

create policy "Users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Tracks -------------------------------------------------------------------

grant select on public.tracks to anon, authenticated;
grant update (title, description, genre_id, tags, feedback_wants, level, waveform_color)
  on public.tracks to authenticated;
grant delete on public.tracks to authenticated;

create policy "Live tracks are public" on public.tracks
  for select to anon, authenticated using (status = 'live');

create policy "Owners see their own tracks" on public.tracks
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "Admins see all tracks" on public.tracks
  for select to authenticated using ((select public.is_admin()));

create policy "Owners edit their own tracks" on public.tracks
  for update to authenticated
  using (owner_id = (select auth.uid()) and status <> 'deleted')
  with check (owner_id = (select auth.uid()));

create policy "Owners and admins delete tracks" on public.tracks
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- track_upload_ips: RLS on, no policies, no grants. Service role only.

-- Comments -----------------------------------------------------------------

grant select on public.comments to anon, authenticated;
grant insert (track_id, parent_id, time_ms, category, body) on public.comments to authenticated;
grant update (body, category, time_ms, is_helpful, resolved_at) on public.comments to authenticated;
grant delete on public.comments to authenticated;

-- A live comment is visible to whoever can see its track. The subquery runs
-- with the caller's RLS on tracks, so comments on hidden tracks are only
-- visible to the track owner and admins.
create policy "Live comments on visible tracks are public" on public.comments
  for select to anon, authenticated
  using (
    status = 'live'
    and exists (select 1 from public.tracks t where t.id = comments.track_id)
  );

create policy "Authors see their own comments" on public.comments
  for select to authenticated using (author_id = (select auth.uid()));

create policy "Admins see all comments" on public.comments
  for select to authenticated using ((select public.is_admin()));

create policy "Users comment on live tracks" on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.tracks t
      where t.id = comments.track_id and t.status = 'live'
    )
  );

-- Two update policies. Which columns each may change is enforced by the
-- comments_before_update trigger.
create policy "Authors edit their own comments" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()) and status <> 'deleted')
  with check (author_id = (select auth.uid()));

create policy "Track owners mark comments Helpful" on public.comments
  for update to authenticated
  using (
    status = 'live'
    and exists (
      select 1 from public.tracks t
      where t.id = comments.track_id and t.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = comments.track_id and t.owner_id = (select auth.uid())
    )
  );

create policy "Authors and admins delete comments" on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- Reactions ----------------------------------------------------------------
-- Who reacted is private. Counts are public through tracks.reaction_counts.

grant select on public.reactions to authenticated;
grant insert (track_id, kind) on public.reactions to authenticated;
grant delete on public.reactions to authenticated;

create policy "Users see their own reactions" on public.reactions
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Users react to live tracks" on public.reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.tracks t
      where t.id = reactions.track_id and t.status = 'live'
    )
  );

create policy "Users remove their own reactions" on public.reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Reports ------------------------------------------------------------------
-- Status changes go through the admin_* functions, never direct updates.

grant select on public.reports to authenticated;
grant insert (target_type, track_id, comment_id, reason, details) on public.reports to authenticated;

create policy "Users see their own reports" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));

create policy "Admins see all reports" on public.reports
  for select to authenticated using ((select public.is_admin()));

create policy "Users report what they can see" on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (
      (target_type = 'track'
        and exists (select 1 from public.tracks t where t.id = reports.track_id))
      or (target_type = 'comment'
        and exists (select 1 from public.comments c where c.id = reports.comment_id))
    )
  );

-- Notifications ------------------------------------------------------------
-- Written by triggers only.

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "Users see their own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Users mark their own notifications read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users delete their own notifications" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- Functions ----------------------------------------------------------------
-- Postgres and Supabase grant EXECUTE to everyone by default. Lock down the
-- internal ones and grant back the API on purpose.

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.reputation_level(integer) to anon, authenticated;
grant execute on function public.track_upload_allowance() to authenticated;
