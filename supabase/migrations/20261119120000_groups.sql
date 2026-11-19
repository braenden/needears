-- Groups: a closed room for a class, a band or a few friends.
--
-- A group is its own world and never mixes with the feed. A song is either
-- in the public feed or in one group, decided by where it is uploaded
-- (tracks.group_id), and that never changes. Only members hear the songs in
-- a group and read what is said about them. Nothing that happens in a group
-- shows or counts outside it: not in the feeds, search, the weekly list,
-- reputation, profile numbers or badges.
--
-- Anyone can read a group's card (its name, owner and member count) and
-- find it in search. The way in is to ask; the owner lets each person in.
-- Leaving or being removed leaves your songs and comments in the group.
-- The uploader can still list and delete their songs there, but hearing
-- them takes membership. Deleting a group deletes every song in it.
--
-- Who may see a track is decided in one place, private.can_see_track. The
-- tracks policies use it, and so do the policies on comments and versions
-- (and with them peaks and the audio URLs signAudio signs). The definer
-- functions that read tracks directly leave group songs out or check it.
-- Admins see group content only after opening it for a report or a legal
-- request (admin_open_closed), for 24 hours, and every opening is logged in
-- private.admin_access with what came of it, kept for 12 months.
--
-- Reports are kept when the track or comment they are about is deleted
-- (also with its owner's account or its group), with the copy of the
-- reported text they already hold.

-- search() and the trigram indexes need pg_trgm loaded in this session.
select extensions.similarity('a', 'b');

create type public.group_role as enum ('owner', 'member');

-- Used only in plpgsql below: a value added here cannot be used by
-- anything checked while this migration runs.
alter type public.notification_kind add value 'group_request';
alter type public.notification_kind add value 'group_joined';

alter table private.rate_limit_events drop constraint rate_limit_events_action_check;
alter table private.rate_limit_events add constraint rate_limit_events_action_check
  check (action in ('track', 'comment', 'report', 'upload', 'reaction', 'group_ask', 'group_create'));

-- Tables ---------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  members_count integer not null default 0 check (members_count between 0 and 50),
  created_at timestamptz not null default now()
);

create index groups_owner_id_idx on public.groups (owner_id, created_at desc);
create index groups_name_trgm_idx on public.groups
  using gin (lower(name) extensions.gin_trgm_ops);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_id_idx on public.group_members (user_id, joined_at desc);

-- Asks to join. One per person and group: pending until the owner answers.
-- A no is kept for 7 days, so the same person cannot ask again before.
create table public.group_join_requests (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (group_id, user_id)
);

create index group_join_requests_pending_idx on public.group_join_requests (group_id, created_at)
  where status = 'pending';
create index group_join_requests_user_id_idx on public.group_join_requests (user_id);

-- People the owner removed. They cannot ask again.
create table private.group_removals (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table private.group_removals enable row level security;

-- A song in a group goes with its group.
alter table public.tracks
  add column group_id uuid references public.groups (id) on delete cascade;

create index tracks_group_id_idx on public.tracks (group_id, published_at desc)
  where group_id is not null;

-- Notifications about a group (an ask, being let in) point at it.
alter table public.notifications
  add column group_id uuid references public.groups (id) on delete cascade;

create index notifications_group_id_idx on public.notifications (group_id)
  where group_id is not null;

-- Who opened which group track, why and until when. Kept when the track
-- or the admin goes, as a record.
create table private.admin_access (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  track_id uuid not null,
  -- Set when the report was about a comment on the track.
  comment_id uuid,
  reason text not null check (reason in ('report', 'legal')),
  report_id uuid,
  note text not null default '' check (char_length(note) <= 1000),
  -- What came of it, set by the admin's decision while the access lasts.
  outcome text check (outcome in ('none', 'hidden', 'removed')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint admin_access_reason check (
    (reason = 'report' and report_id is not null)
    or (reason = 'legal' and char_length(btrim(note)) >= 10)
  )
);

create index admin_access_lookup_idx on private.admin_access (track_id, admin_id, expires_at);

alter table private.admin_access enable row level security;

-- Who may see a track ----------------------------------------------------------

create function private.is_group_member(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_group is not null and p_user is not null and exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = p_user
  );
$$;

create function private.admin_has_access(p_track uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and exists (select 1 from public.profiles where id = p_user and role = 'admin')
    and exists (
      select 1 from private.admin_access a
      where a.track_id = p_track and a.admin_id = p_user and a.expires_at > now()
    );
$$;

-- The rule: a feed track is for everyone (its status is checked by the
-- caller, as before), a group track for the members of its group and for
-- an admin who opened it. Not for its uploader once they have left: they
-- still find it in their own list (the owner policy on tracks), but its
-- sound and comments are for members. Moderation status is not part of it,
-- so hidden feed tracks stay visible to admins and owners as before.
create function private.can_see_track(p_track public.tracks, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_track.id is not null and (
    p_track.group_id is null
    or private.is_group_member(p_track.group_id, p_viewer)
    or private.admin_has_access(p_track.id, p_viewer)
  );
$$;

-- The same, by id, for everything that only has the track's id.
create function private.can_see_track(p_track uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.can_see_track(t, p_viewer) from public.tracks t where t.id = p_track),
    false
  );
$$;

-- Taking part (commenting, reacting, playing, marking Helpful, editing):
-- like seeing, without an admin's opening, which is for reading only.
create function private.can_take_part(p_track uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select t.group_id is null or private.is_group_member(t.group_id, p_viewer)
    from public.tracks t where t.id = p_track
  ), false);
$$;

-- Policies run as the visitor, who has no use of the private schema. These
-- wrappers in their own schema let them ask the question for the visitor
-- (auth.uid()) only, never for someone else. The schema is not exposed by
-- the API.
create schema access;
revoke all on schema access from public;
grant usage on schema access to anon, authenticated;

create function access.can_see_track(p_track public.tracks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_see_track(p_track, (select auth.uid()));
$$;

create function access.can_see_track(p_track uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_see_track(p_track, (select auth.uid()));
$$;

create function access.can_take_part(p_track uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_take_part(p_track, (select auth.uid()));
$$;

create function access.is_group_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_group_member(p_group, (select auth.uid()));
$$;

-- Tracks ------------------------------------------------------------------------
-- "Owners see their own tracks" stays: the uploader always finds their
-- songs in their own list, also after leaving the group.

drop policy "Live tracks are public" on public.tracks;
create policy "Live tracks are for who may see them" on public.tracks
  for select to anon, authenticated
  using (status = 'live' and (group_id is null or access.can_see_track(tracks)));

drop policy "Admins see all tracks" on public.tracks;
create policy "Admins see tracks they may see" on public.tracks
  for select to authenticated
  using ((select public.is_admin()) and access.can_see_track(tracks));

-- Editing a song in a group is for members.
drop policy "Owners edit their own live tracks" on public.tracks;
create policy "Owners edit their own live tracks" on public.tracks
  for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'live' and access.can_take_part(id))
  with check (owner_id = (select auth.uid()) and access.can_take_part(id));

-- Versions, and with them peaks and audio: for who may see the track, not
-- for an uploader who has left its group.
drop policy "Versions of visible tracks are public" on public.track_versions;
create policy "Versions of visible tracks are public" on public.track_versions
  for select to anon, authenticated
  using (
    exists (select 1 from public.tracks t where t.id = track_versions.track_id)
    and access.can_see_track(track_id)
  );

-- Comments, reactions and reports ------------------------------------------------

drop policy "Live and withdrawn comments on visible tracks are public" on public.comments;
create policy "Live and withdrawn comments on visible tracks are public" on public.comments
  for select to anon, authenticated
  using (
    status in ('live', 'withdrawn')
    and exists (select 1 from public.tracks t where t.id = comments.track_id)
    and access.can_see_track(track_id)
  );

drop policy "Admins see all comments" on public.comments;
create policy "Admins see comments on tracks they may see" on public.comments
  for select to authenticated
  using ((select public.is_admin()) and access.can_see_track(track_id));

drop policy "Users comment on live tracks" on public.comments;
create policy "Users comment on live tracks they may see" on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.tracks t where t.id = comments.track_id and t.status = 'live')
    and access.can_take_part(track_id)
  );

drop policy "Authors delete live comments, admins any" on public.comments;
create policy "Authors delete live comments, admins those they may see" on public.comments
  for delete to authenticated
  using (
    (author_id = (select auth.uid()) and status = 'live')
    or ((select public.is_admin()) and access.can_see_track(track_id))
  );

-- Authors edit their comments only where they still take part (not after
-- leaving the group).
drop policy "Authors edit their own live comments" on public.comments;
create policy "Authors edit their own live comments" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()) and status = 'live' and access.can_take_part(track_id))
  with check (author_id = (select auth.uid()) and access.can_take_part(track_id));

drop policy "Track owners mark comments Helpful" on public.comments;
create policy "Track owners mark comments Helpful" on public.comments
  for update to authenticated
  using (
    status = 'live'
    and exists (
      select 1 from public.tracks t
      where t.id = comments.track_id and t.owner_id = (select auth.uid())
    )
    and access.can_take_part(track_id)
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = comments.track_id and t.owner_id = (select auth.uid())
    )
    and access.can_take_part(track_id)
  );

drop policy "Users react to live tracks" on public.reactions;
create policy "Users react to live tracks they may see" on public.reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tracks t where t.id = reactions.track_id and t.status = 'live')
    and access.can_take_part(track_id)
  );

drop policy "Users change their own reaction" on public.reactions;
create policy "Users change their own reaction" on public.reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tracks t where t.id = reactions.track_id and t.status = 'live')
    and access.can_take_part(track_id)
  );

-- Reports stay when what they are about is deleted. in_group remembers that
-- it was about group content, for when the track is gone.
alter table public.reports drop constraint reports_track_id_fkey;
alter table public.reports add constraint reports_track_id_fkey
  foreign key (track_id) references public.tracks (id) on delete set null;
alter table public.reports drop constraint reports_comment_id_fkey;
alter table public.reports add constraint reports_comment_id_fkey
  foreign key (comment_id) references public.comments (id) on delete set null;
alter table public.reports drop constraint reports_target_matches;
alter table public.reports add constraint reports_target_matches check (
  (target_type = 'track' and comment_id is null)
  or (target_type = 'comment' and track_id is null)
);
alter table public.reports add column in_group boolean not null default false;
-- Settled by the group's owner removing what it was about, not by an admin.
alter table public.reports add column removed_by_group_owner boolean not null default false;

create function private.reports_mark_in_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.in_group := exists (
    select 1 from public.tracks t
    where t.group_id is not null
      and t.id = coalesce(new.track_id, (select c.track_id from public.comments c where c.id = new.comment_id))
  );
  return new;
end;
$$;

create trigger reports_mark_in_group
  before insert on public.reports
  for each row execute function private.reports_mark_in_group();

-- When group content a report is about is deleted, nobody can open it any
-- more (admin_open_closed needs the track), so the report keeps no copy of
-- it either. The report itself stays as a record.
create function private.reports_forget_group_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.in_group and new.track_id is null and new.comment_id is null then
    new.reported_text := '';
    new.details := '';
  end if;
  return new;
end;
$$;

create trigger reports_forget_group_text
  before update of track_id, comment_id on public.reports
  for each row execute function private.reports_forget_group_text();

-- A report is about a track, or a comment on one.
create function private.report_track(p_report public.reports)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_report.track_id,
    (select c.track_id from public.comments c where c.id = p_report.comment_id)
  );
$$;

create function access.can_see_report(p_report public.reports)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.report_track(p_report) is null then not p_report.in_group
    else private.can_see_track(private.report_track(p_report), (select auth.uid()))
  end;
$$;

-- Reports carry a copy of the reported text, so admins see reports about
-- group content in full only after opening it. admin_closed_reports()
-- lists them without the text.
drop policy "Admins see all reports" on public.reports;
create policy "Admins see reports about what they may see" on public.reports
  for select to authenticated
  using (
    (select public.is_admin())
    and access.can_see_report(reports)
  );

-- Notifications never point anyone at a group track they cannot see (a
-- former member, for example). Moderation notices go to the people the
-- moderation concerns.
create function private.notifications_only_visible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'moderation'
    and new.track_id is not null
    and not private.can_see_track(new.track_id, new.user_id)
  then
    return null;
  end if;
  return new;
end;
$$;

create trigger notifications_only_visible
  before insert on public.notifications
  for each row execute function private.notifications_only_visible();

-- Groups: who sees what ----------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_join_requests enable row level security;

revoke all on public.groups from anon, authenticated;
revoke all on public.group_members from anon, authenticated;
revoke all on public.group_join_requests from anon, authenticated;

-- The card: name, owner and member count. Members read the same. Groups of
-- a banned owner are only for their members.
grant select (id, slug, name, owner_id, members_count, created_at)
  on public.groups to anon, authenticated;
create policy "Group cards are public, unless the owner is banned" on public.groups
  for select to anon, authenticated
  using (
    exists (select 1 from public.profiles p where p.id = groups.owner_id and p.banned_at is null)
    or access.is_group_member(id)
  );

grant select on public.group_members to anon, authenticated;
create policy "Members see who else is in their group" on public.group_members
  for select to anon, authenticated
  using (access.is_group_member(group_id));

-- The person asking sees their own open ask, the owner the open asks to
-- their group. A no shows to nobody.
grant select (group_id, user_id, created_at) on public.group_join_requests to authenticated;
create policy "Open asks for the asker and the owner" on public.group_join_requests
  for select to authenticated
  using (
    status = 'pending'
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.groups g
        where g.id = group_join_requests.group_id and g.owner_id = (select auth.uid())
      )
    )
  );

-- Groups: rules ----------------------------------------------------------------

create function private.groups_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger groups_before_write
  before insert or update on public.groups
  for each row execute function private.groups_before_write();

create function private.group_members_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Leaving or being removed only changes the count: the person's songs
  -- and comments stay in the group.
  if tg_op = 'INSERT' then
    update public.groups set members_count = members_count + 1 where id = new.group_id;
  else
    update public.groups set members_count = greatest(members_count - 1, 0) where id = old.group_id;
  end if;
  return null;
end;
$$;

create trigger group_members_count
  after insert or delete on public.group_members
  for each row execute function private.group_members_count();

-- Tracks: which group ------------------------------------------------------------
-- The upload route sets group_id on insert, and nothing changes it after:
-- a song is in the feed or in its group for good. Only members post to a
-- group.

create function private.tracks_group_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.group_id is distinct from old.group_id then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'A track stays where it was uploaded.';
    end if;
    return new;
  end if;
  if new.group_id is not null then
    -- Locked, so a removal or a deletion at the same moment waits.
    perform 1 from public.groups where id = new.group_id for share;
    perform 1 from public.group_members
    where group_id = new.group_id and user_id = new.owner_id for share;
    if not private.is_group_member(new.group_id, new.owner_id) then
      raise exception 'not_in_group' using errcode = '42501',
        detail = 'Post only to a group you are in.';
    end if;
  end if;
  return new;
end;
$$;

create trigger tracks_group_rules
  before insert or update of group_id on public.tracks
  for each row execute function private.tracks_group_rules();

-- A new version of a song in a group is for members too.
create function private.track_versions_group_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tracks;
begin
  select * into t from public.tracks where id = new.track_id;
  if t.group_id is not null and not private.is_group_member(t.group_id, t.owner_id) then
    raise exception 'not_in_group' using errcode = '42501',
      detail = 'Post only to a group you are in.';
  end if;
  return new;
end;
$$;

create trigger track_versions_group_rule
  before insert on public.track_versions
  for each row execute function private.track_versions_group_rule();

-- RPCs: groups ------------------------------------------------------------------

create function private.group_member_cap()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 50;
$$;

create function public.create_group(p_name text)
returns table (id uuid, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean text := btrim(coalesce(p_name, ''));
  base text;
  g public.groups;
begin
  if uid is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform private.require_handle(uid);
  if exists (select 1 from public.profiles p where p.id = uid and p.banned_at is not null) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if char_length(clean) not between 1 and 60 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('groups:' || uid::text, 0));
  if (select count(*) from public.groups o where o.owner_id = uid) >= 3 then
    raise exception 'too_many_groups' using errcode = '22023',
      detail = 'You can have three groups. Delete one first.';
  end if;
  perform private.consume_rate_limit(uid, 'group_create');

  base := btrim(left(private.slugify(clean), 60), '-');
  insert into public.groups (slug, name, owner_id)
  values (
    case when base = '' then '' else base || '-' end || private.random_suffix(8),
    clean, uid
  )
  returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');
  return query select g.id, g.slug;
end;
$$;

create function private.owned_group(p_group uuid)
returns public.groups
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.groups;
begin
  select * into g from public.groups where id = p_group and owner_id = (select auth.uid());
  if g.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- A banned owner keeps the group for its members, but no longer runs it.
  if exists (select 1 from public.profiles p where p.id = g.owner_id and p.banned_at is not null) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return g;
end;
$$;

-- Asks to join a group. Returns 'pending' (asked, also when already
-- asking) or 'member' (already in). A group whose owner is banned answers
-- like a missing one.
create function public.ask_to_join(p_group uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  g public.groups;
  r public.group_join_requests;
  asked boolean;
begin
  if uid is null
    or exists (select 1 from public.profiles where id = uid and banned_at is not null)
  then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform private.require_handle(uid);

  select * into g from public.groups where id = p_group for share;
  if g.id is null
    or exists (select 1 from public.profiles where id = g.owner_id and banned_at is not null)
  then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if private.is_group_member(g.id, uid) then
    return 'member';
  end if;
  if exists (select 1 from private.group_removals where group_id = g.id and user_id = uid) then
    raise exception 'removed_from_group' using errcode = '42501';
  end if;

  select * into r from public.group_join_requests
  where group_id = g.id and user_id = uid for update;
  if r.status = 'pending' then
    return 'pending';
  end if;
  if r.status = 'declined' and r.decided_at > now() - interval '7 days' then
    raise exception 'asked_recently' using errcode = '22023',
      detail = 'You can ask again later.';
  end if;
  if g.members_count >= private.group_member_cap() then
    raise exception 'group_full' using errcode = '22023';
  end if;

  insert into public.group_join_requests (group_id, user_id)
  values (g.id, uid)
  on conflict (group_id, user_id) do update
    set status = 'pending', created_at = now(), decided_at = null
    where public.group_join_requests.status = 'declined'
  returning true into asked;
  if asked is null then
    return 'pending';
  end if;
  -- Counted only for an ask that was made; an error here undoes it.
  perform private.consume_rate_limit(uid, 'group_ask');

  insert into public.notifications (user_id, kind, actor_id, group_id)
  values (g.owner_id, 'group_request', uid, g.id);
  return 'pending';
end;
$$;

-- Takes back an open ask. Nothing happens if there is none.
create function public.withdraw_ask(p_group uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  delete from public.group_join_requests
  where group_id = p_group and user_id = uid and status = 'pending';
  if found then
    delete from public.notifications
    where group_id = p_group and actor_id = uid and kind = 'group_request';
  end if;
end;
$$;

-- The owner lets someone in (p_accept) or says no. A no is quiet: nobody
-- is told, and the person can ask again after 7 days.
create function public.answer_ask(p_group uuid, p_user uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g public.groups := private.owned_group(p_group);
begin
  -- The group first, so the count is read under the lock.
  select * into g from public.groups where id = g.id for update;
  perform 1 from public.group_join_requests
  where group_id = g.id and user_id = p_user and status = 'pending' for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if coalesce(p_accept, false) then
    if exists (select 1 from public.profiles where id = p_user and banned_at is not null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if g.members_count >= private.group_member_cap() then
      raise exception 'group_full' using errcode = '22023';
    end if;
    delete from public.group_join_requests where group_id = g.id and user_id = p_user;
    insert into public.group_members (group_id, user_id) values (g.id, p_user);
    insert into public.notifications (user_id, kind, actor_id, group_id)
    values (p_user, 'group_joined', g.owner_id, g.id);
  else
    update public.group_join_requests
    set status = 'declined', decided_at = now()
    where group_id = g.id and user_id = p_user;
  end if;
  -- The ask is answered; its notice has done its job.
  delete from public.notifications
  where user_id = g.owner_id and group_id = g.id and actor_id = p_user and kind = 'group_request';
end;
$$;

-- Someone who leaves or is removed is no longer pointed at the group or
-- anything in it. Notices about moderation of their own posts stay.
create function private.forget_group_notices(p_group uuid, p_user uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.notifications n
  where n.user_id = p_user
    and n.kind <> 'moderation'
    and (n.group_id = p_group
      or n.track_id in (select t.id from public.tracks t where t.group_id = p_group));
$$;

-- The signed in person's groups, newest first: the owner also gets how
-- many people are waiting for an answer.
create function public.my_groups()
returns table (
  id uuid,
  slug text,
  name text,
  role public.group_role,
  members_count integer,
  asks integer,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select gr.id, gr.slug, gr.name, m.role, gr.members_count,
    case when m.role = 'owner' then (
      select count(*)::integer from public.group_join_requests r
      where r.group_id = gr.id and r.status = 'pending'
    ) end,
    m.joined_at
  from public.group_members m
  join public.groups gr on gr.id = m.group_id
  where m.user_id = (select auth.uid())
  order by m.joined_at desc;
$$;

-- Where the signed in person stands with a group, for its card: a member,
-- asking, when they may ask again after a no (null when they may now),
-- removed by the owner, and whether the group is full. No row for a group
-- they cannot see.
create function public.group_status(p_group uuid)
returns table (
  is_member boolean,
  asked boolean,
  ask_again_at timestamptz,
  removed boolean,
  is_full boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  g public.groups;
  r public.group_join_requests;
begin
  select * into g from public.groups where groups.id = p_group;
  if g.id is null
    or (exists (select 1 from public.profiles p where p.id = g.owner_id and p.banned_at is not null)
      and not private.is_group_member(g.id, uid))
  then
    return;
  end if;
  select * into r from public.group_join_requests jr where jr.group_id = g.id and jr.user_id = uid;
  return query select
    private.is_group_member(g.id, uid),
    coalesce(r.status = 'pending', false),
    case when r.status = 'declined' and r.decided_at > now() - interval '7 days'
      then r.decided_at + interval '7 days' end,
    exists (select 1 from private.group_removals gr where gr.group_id = g.id and gr.user_id = uid),
    g.members_count >= private.group_member_cap();
end;
$$;

-- The signed in person's tracks in groups, for their own list: with the
-- group, and whether they are still in it (only members hear them).
create function public.my_group_tracks()
returns table (
  track_id uuid,
  slug text,
  title text,
  status public.track_status,
  published_at timestamptz,
  group_id uuid,
  group_slug text,
  group_name text,
  is_member boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.slug, t.title, t.status, t.published_at, gr.id, gr.slug, gr.name,
    private.is_group_member(gr.id, (select auth.uid()))
  from public.tracks t
  join public.groups gr on gr.id = t.group_id
  where t.owner_id = (select auth.uid())
    and t.status <> 'deleted'
  order by t.published_at desc;
$$;

-- Groups by name, for their own section in search: the card (name, slug,
-- member count, the owner's name and handle). Ranked like search(): the
-- whole name, then the start of a word in it, then similar names (for
-- typos) when nothing matches better. A group whose owner is banned is not
-- found.
create function public.search_groups(p_query text, p_limit integer default 10)
returns table (
  id uuid,
  slug text,
  name text,
  members_count integer,
  owner_name text,
  owner_handle text,
  rank real
)
language plpgsql
stable
set search_path = ''
set "pg_trgm.word_similarity_threshold" to '0.3'
set statement_timeout to '500ms'
as $$
#variable_conflict use_column
declare
  q text;
  n integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if p_query is null or octet_length(p_query) > 400 then
    return;
  end if;
  q := lower(btrim(p_query));
  if char_length(q) < 3 or char_length(q) > 100 then
    return;
  end if;

  return query
  with hits as (
    select gr.id, gr.slug, gr.name, gr.members_count, p.display_name, p.handle,
      case
        when lower(gr.name) = q then 3
        when position(' ' || q in ' ' || lower(gr.name)) > 0 then 2
        else 1
      end as tier,
      extensions.word_similarity(q, lower(gr.name)) as sim
    from public.groups gr
    join public.profiles p on p.id = gr.owner_id
    where p.banned_at is null
      and q operator(extensions.<%) lower(gr.name)
  )
  select h.id, h.slug, h.name, h.members_count, h.display_name, h.handle, (h.tier + h.sim)::real
  from hits h
  where h.tier >= 2 or not exists (select 1 from hits s where s.tier >= 2)
  order by h.tier + h.sim desc, h.members_count desc, h.name
  limit n;
end;
$$;

-- Whether the address of a track holds a track in a group that the
-- visitor cannot hear, so the page can say so instead of "not found".
-- Only yes or no: nothing about the track, its owner or its group.
create function public.is_group_track(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tracks t
    where t.slug = p_slug
      and t.status = 'live'
      and t.group_id is not null
      and not private.can_see_track(t, (select auth.uid()))
  );
$$;

-- The groups the signed in person was removed from, for their data
-- export.
create function public.my_group_removals()
returns table (group_id uuid, group_name text, removed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.group_id, gr.name, r.removed_at
  from private.group_removals r
  join public.groups gr on gr.id = r.group_id
  where r.user_id = (select auth.uid())
  order by r.removed_at;
$$;

-- Leaving leaves your songs and comments in the group. The owner cannot
-- leave: they delete the group, or their account.
create function public.leave_group(p_group uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if exists (select 1 from public.groups where id = p_group and owner_id = uid) then
    raise exception 'owner_cannot_leave' using errcode = '22023',
      detail = 'Delete the group instead.';
  end if;
  -- The group first, in the same order as posting to it.
  perform 1 from public.groups where id = p_group for update;
  delete from public.group_members where group_id = p_group and user_id = uid;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.forget_group_notices(p_group, uid);
end;
$$;

-- Someone removed keeps their songs and comments in the group, and cannot
-- ask again.
create function public.remove_member(p_group uuid, p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g public.groups := private.owned_group(p_group);
begin
  if p_user = g.owner_id then
    raise exception 'owner_cannot_leave' using errcode = '22023';
  end if;
  perform 1 from public.groups where id = g.id for update;
  delete from public.group_members where group_id = g.id and user_id = p_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into private.group_removals (group_id, user_id) values (g.id, p_user)
  on conflict do nothing;
  perform private.forget_group_notices(g.id, p_user);
end;
$$;

-- The files of a track's versions, for the caller to remove from R2 and
-- Storage right away. The daily cleanup removes them too if nobody does.
create function private.track_files(p_track uuid)
returns table (audio_key text, peaks_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.audio_key, t.peaks_key from public.tracks t where t.id = p_track
  union
  select v.audio_key, v.peaks_key from public.track_versions v where v.track_id = p_track;
$$;

-- Deletes a song in a group with everything on it, for the owner's
-- functions below. The comments go with the track: the checks a person
-- deleting one comment gets (replies, open reports) were made for the
-- track as a whole before.
create function private.delete_group_track(p_track uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('needears.deleting_track', p_track::text, true);
  delete from public.tracks where id = p_track and group_id is not null;
  perform set_config('needears.deleting_track', '', true);
end;
$$;

-- Open reports about a track in a group (and its comments), or about one
-- comment, that its owner removes: settled, as a record of who reported
-- what, why and when. The copy of the content goes with the content.
create function private.settle_reports_by_group_owner(p_track uuid, p_comment uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.reports r
  set status = 'resolved', resolved_by = (select auth.uid()), resolved_at = now(),
    removed_by_group_owner = true, reported_text = '', details = ''
  where r.status = 'open'
    and (
      (p_track is not null and (
        r.track_id = p_track
        or r.comment_id in (select c.id from public.comments c where c.track_id = p_track)))
      or (p_comment is not null and r.comment_id = p_comment)
    );
$$;

-- The group owner removes a track from their group: it is deleted, for
-- its uploader too, also when moderation hid it or it is reported (its
-- reports are settled). Returns its files.
create function public.remove_track_from_group(p_track uuid)
returns table (audio_key text, peaks_key text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.tracks;
begin
  select * into t from public.tracks tr where tr.id = p_track;
  if t.id is null or t.group_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.owned_group(t.group_id);
  perform 1 from public.groups where id = t.group_id for share;
  -- A report on the track or one of its comments made at the same moment
  -- waits for these locks, so it is settled too (or fails with the track).
  select * into t from public.tracks tr where tr.id = p_track for update;
  perform 1 from public.comments c where c.track_id = t.id for update;
  perform private.settle_reports_by_group_owner(t.id, null);
  return query select f.audio_key, f.peaks_key from private.track_files(t.id) f;
  perform private.delete_group_track(t.id);
end;
$$;

-- The owner deletes the group and every track in it, also hidden or
-- reported ones (their reports are settled). Returns the tracks' files.
create function public.delete_group(p_group uuid)
returns table (audio_key text, peaks_key text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g public.groups := private.owned_group(p_group);
begin
  perform 1 from public.groups where id = g.id for update;
  -- As in remove_track_from_group: a report made now waits, and is settled.
  perform 1 from public.tracks t where t.group_id = g.id for update;
  perform 1 from public.comments c
  where c.track_id in (select t.id from public.tracks t where t.group_id = g.id) for update;
  perform private.settle_reports_by_group_owner(t.id, null)
  from public.tracks t where t.group_id = g.id;
  return query
  select distinct f.audio_key, f.peaks_key
  from public.tracks t
  cross join lateral private.track_files(t.id) f
  where t.group_id = g.id;
  delete from public.groups where id = g.id;
end;
$$;

-- A group deletes its songs before itself (also when its owner deletes
-- their account), so nothing else in the same delete (comment counts, for
-- example) updates a song that still points at a group already gone.
create function private.groups_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.delete_group_track(t.id) from public.tracks t where t.group_id = old.id;
  return old;
end;
$$;

create trigger groups_before_delete
  before delete on public.groups
  for each row execute function private.groups_before_delete();

-- RPCs: admin access to group content --------------------------------------------

-- Records what came of an opening: the decisions the calling admin made on
-- a group track while their access lasted, the strictest one. Feed
-- content has no opening, so nothing is recorded for it.
create function private.record_access_outcome(p_track uuid, p_outcome text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  -- The strictest decision stands: removed over hidden over none.
  update private.admin_access
  set outcome = p_outcome, decided_at = now()
  where track_id = p_track
    and admin_id = (select auth.uid())
    and expires_at > now()
    and coalesce(array_position(array['none', 'hidden', 'removed'], outcome), 0)
      < array_position(array['none', 'hidden', 'removed'], p_outcome);
$$;

-- A group track deleted while it is open to an admin: that is what came of
-- the opening, whoever deleted it.
create function private.tracks_record_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.admin_access
  set outcome = 'removed', decided_at = now()
  where track_id = old.id and expires_at > now() and outcome is distinct from 'removed';
  return null;
end;
$$;

create trigger tracks_record_removal
  after delete on public.tracks
  for each row
  when (old.group_id is not null)
  execute function private.tracks_record_removal();

-- Opens a group track (and its comments, versions and reports) for the
-- calling admin for 24 hours: for a report about the track or one of its
-- comments, or a legal request described in the note. Logged.
create function public.admin_open_closed(
  p_track uuid,
  p_reason text,
  p_report uuid default null,
  p_note text default ''
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  until timestamptz;
begin
  perform private.require_admin();
  if not exists (select 1 from public.tracks where id = p_track) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_reason = 'report' then
    if p_report is null or not exists (
      select 1 from public.reports r
      where r.id = p_report and private.report_track(r) = p_track and r.status = 'open'
    ) then
      raise exception 'no_such_report' using errcode = '22023';
    end if;
  elsif p_reason = 'legal' then
    if char_length(btrim(coalesce(p_note, ''))) < 10 then
      raise exception 'note_required' using errcode = '22023',
        detail = 'Say which request this is for.';
    end if;
  else
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  insert into private.admin_access (admin_id, track_id, comment_id, reason, report_id, note)
  values (uid, p_track,
    case when p_reason = 'report' then (select r.comment_id from public.reports r where r.id = p_report) end,
    p_reason, case when p_reason = 'report' then p_report end,
    left(btrim(coalesce(p_note, '')), 1000))
  returning expires_at into until;
  return until;
end;
$$;

-- Reports about group content, without their text, so admins know what to
-- open. The rest of the reports are in the reports table as before.
create function public.admin_closed_reports()
returns table (
  report_id uuid,
  track_id uuid,
  target_type public.report_target,
  reason public.report_reason,
  status public.report_status,
  removed_by_group_owner boolean,
  created_at timestamptz,
  opened_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select r.id, private.report_track(r), r.target_type, r.reason, r.status,
    r.removed_by_group_owner, r.created_at,
    (select max(a.expires_at) from private.admin_access a
     where a.track_id = private.report_track(r) and a.admin_id = (select auth.uid())
       and a.expires_at > now())
  from public.reports r
  left join public.tracks t on t.id = private.report_track(r)
  where t.group_id is not null or (t.id is null and r.in_group)
  order by r.created_at desc
  limit 200;
end;
$$;
-- Functions that read tracks directly: group songs stay out --------------------

CREATE OR REPLACE FUNCTION public.feed_latest(p_genre text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS SETOF tracks
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select t.*
  from public.tracks t
  where t.status = 'live'
    and t.group_id is null
    and (p_genre is null or t.genre_id = (select g.id from public.genres g where g.slug = p_genre))
  order by t.published_at desc, t.id
  limit least(greatest(p_page_size, 1), 50)
  offset (least(greatest(p_page, 1), 50) - 1) * least(greatest(p_page_size, 1), 50);
$function$;

CREATE OR REPLACE FUNCTION public.feed_trending(p_genre text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS SETOF tracks
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with commenters as (
    select distinct on (c.track_id, c.author_id) c.track_id, c.created_at
    from public.comments c
    join public.tracks t on t.id = c.track_id
    where c.created_at > now() - interval '7 days'
      and c.status = 'live'
      and c.author_id <> t.owner_id
    order by c.track_id, c.author_id, c.created_at desc
  ),
  events as (
    select track_id, 2.0 as weight, created_at
    from commenters
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
    and t.group_id is null
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
$function$;

CREATE OR REPLACE FUNCTION public.feed_needs_ears(p_genre text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS SETOF tracks
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select t.*
  from public.tracks t
  where t.needs_ears
    and t.group_id is null
    and t.owner_id is distinct from (select auth.uid())
    and (p_genre is null or t.genre_id = (select g.id from public.genres g where g.slug = p_genre))
  order by t.published_at desc, t.id
  limit least(greatest(p_page_size, 1), 50)
  offset (least(greatest(p_page, 1), 50) - 1) * least(greatest(p_page_size, 1), 50);
$function$;

CREATE OR REPLACE FUNCTION public.search(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(kind text, id uuid, slug text, title text, handle text, display_name text, rank real)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
 SET "pg_trgm.word_similarity_threshold" TO '0.3'
 SET statement_timeout TO '500ms'
AS $function$
#variable_conflict use_column
declare
  q text;
  n integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  -- Refuse huge input before doing any work on it.
  if p_query is null or octet_length(p_query) > 400 then
    return;
  end if;
  q := lower(btrim(p_query));
  if char_length(q) < 3 or char_length(q) > 100 then
    return;
  end if;

  -- Tier 3: the whole handle, display name, title or a tag. Tier 2: the
  -- start of the handle, or of a word in the display name or title. Tier 1:
  -- similar (word similarity), for typos. The rank is the tier plus the
  -- similarity, and a track found through its artist ranks just below the
  -- artist. Tracks in groups are never found (groups have search_groups).
  return query
  with people as (
    select p.id, p.handle, p.display_name,
      case
        when p.handle = q or lower(p.display_name) = q then 3
        when starts_with(p.handle, q)
          or position(' ' || q in ' ' || lower(p.display_name)) > 0 then 2
        else 1
      end as tier,
      greatest(
        extensions.word_similarity(q, p.handle),
        extensions.word_similarity(q, lower(p.display_name))
      ) as sim
    from public.profiles p
    where p.banned_at is null
      and p.onboarded_at is not null
      -- A match at the start of a word is always similar enough too, so
      -- these use the trigram indexes and the tiers only rank.
      and (
        q operator(extensions.<%) p.handle
        or q operator(extensions.<%) lower(p.display_name)
      )
    order by 4 desc, 5 desc, p.handle
    limit n
  ),
  track_hits as (
    select t.id,
      case
        when lower(t.title) = q or q = any (t.tags) then 3
        when position(' ' || q in ' ' || lower(t.title)) > 0 then 2
        else 1
      end as tier,
      greatest(
        extensions.word_similarity(q, lower(t.title)),
        extensions.word_similarity(q, public.tags_text(t.tags))
      ) as sim
    from public.tracks t
    where t.status = 'live'
      and t.group_id is null
      and (
        q operator(extensions.<%) lower(t.title)
        or q operator(extensions.<%) public.tags_text(t.tags)
      )
    union all
    select t.id, pe.tier, pe.sim - 0.1
    from people pe
    join public.tracks t on t.owner_id = pe.id
    where t.status = 'live'
      and t.group_id is null
  ),
  tracks_ranked as (
    select t.id, t.slug, t.title, p.handle, p.display_name, t.published_at,
      max(h.tier) as tier, max(h.tier + h.sim) as score
    from track_hits h
    join public.tracks t on t.id = h.id
    join public.profiles p on p.id = t.owner_id
    where p.banned_at is null
    group by t.id, t.slug, t.title, p.handle, p.display_name, t.published_at
  ),
  candidates as (
    select 'track'::text as kind, tr.id, tr.slug, tr.title, tr.handle, tr.display_name,
      tr.tier, tr.score, tr.published_at
    from tracks_ranked tr
    union all
    select 'profile'::text, pe.id, null::text, null::text, pe.handle, pe.display_name,
      pe.tier, pe.tier + pe.sim, null::timestamptz
    from people pe
  )
  select c.kind, c.id, c.slug, c.title, c.handle, c.display_name, c.score::real
  from candidates c
  -- Fuzzy matches only when nothing matches better.
  where c.tier >= 2 or not exists (select 1 from candidates s where s.tier >= 2)
  order by c.score desc, c.kind desc, c.published_at desc nulls last
  limit n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.weekly_helpful_leaders(p_week_start date DEFAULT NULL::date)
 RETURNS TABLE(user_id uuid, handle text, display_name text, avatar_url text, avatar_key text, reputation integer, helpful integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  week date := date_trunc('week', coalesce(p_week_start, private.oslo_week_start(now()))::timestamp)::date;
  starts timestamptz := week::timestamp at time zone 'Europe/Oslo';
  ends timestamptz := (week + 7)::timestamp at time zone 'Europe/Oslo';
  rules public.trust_rules := private.trust_rules();
begin
  -- Only this week and the two years before it.
  if week > private.oslo_week_start(now()) or week < private.oslo_week_start(now()) - 728 then
    return;
  end if;

  return query
  with marks as (
    select c.author_id, t.owner_id, count(*) as n, max(c.first_helpful_at) as last_at
    from public.comments c
    join public.tracks t on t.id = c.track_id
    join public.profiles g on g.id = t.owner_id
    where c.is_helpful
      and c.status = 'live'
      and c.first_helpful_at >= starts
      and c.first_helpful_at < ends
      and t.status <> 'deleted'
      and t.group_id is null
      and private.helpful_giver_counts(g, rules)
    group by c.author_id, t.owner_id
  )
  select p.id, p.handle, p.display_name, p.avatar_url, p.avatar_key, p.reputation,
    sum(least(m.n, rules.helpful_per_giver))::integer as helpful
  from marks m
  join public.profiles p on p.id = m.author_id
  where p.banned_at is null
  group by p.id
  order by helpful desc, max(m.last_at) asc, p.handle
  limit 10;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_play(p_track uuid, p_listener text, p_user uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  track_owner uuid;
  recent integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('play:' || p_listener, 0));

  select owner_id into track_owner
  from public.tracks
  where id = p_track and status = 'live';
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  -- Only plays by someone who may take part count.
  if not private.can_take_part(p_track, p_user) then
    raise exception 'not_found' using errcode = '22023';
  end if;

  if p_user is not null and p_user = track_owner then
    return false;
  end if;

  if exists (
    select 1 from private.play_events
    where listener = p_listener
      and track_id = p_track
      and created_at > now() - interval '1 hour'
  ) then
    return false;
  end if;

  select count(*) into recent
  from private.play_events
  where listener = p_listener
    and created_at > now() - interval '1 hour';
  if recent >= 120 then
    raise exception 'rate_limited'
      using errcode = 'PT429', hint = 'Too many plays from here. Try again in an hour.';
  end if;

  insert into private.play_events (track_id, listener) values (p_track, p_listener);
  update public.tracks set play_count = play_count + 1 where id = p_track;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_track_status(p_track uuid, p_status track_status, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Group content only after it was opened for a report or a legal
  -- request (admin_open_closed).
  if not private.can_see_track(p_track, (select auth.uid())) then
    raise exception 'closed_needs_access' using errcode = '42501',
      detail = 'Open this track first.';
  end if;

  update public.tracks set status = p_status where id = p_track;
  perform private.record_access_outcome(p_track,
    case p_status when 'hidden' then 'hidden' when 'deleted' then 'removed' else 'none' end);

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
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_comment_status(p_comment uuid, p_status comment_status, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Group content only after it was opened for a report or a legal
  -- request (admin_open_closed).
  if not private.can_see_track(track, (select auth.uid())) then
    raise exception 'closed_needs_access' using errcode = '42501',
      detail = 'Open this track first.';
  end if;

  update public.comments set status = p_status where id = p_comment;
  perform private.record_access_outcome(track,
    case p_status when 'hidden' then 'hidden' when 'deleted' then 'removed' else 'none' end);

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
$function$;

CREATE OR REPLACE FUNCTION private.consume_rate_limit(p_user uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  helpful integer;
  lim public.reputation_levels;
  used_hour integer;
  used_day integer;
  used_week integer;
begin
  if private.is_seeding() then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action || ':' || p_user::text, 0));

  select reputation into helpful from public.profiles where id = p_user;
  lim := public.reputation_level(coalesce(helpful, 0));

  select
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*) filter (where created_at > now() - interval '1 day'),
    count(*)
  into used_hour, used_day, used_week
  from private.rate_limit_events
  where user_id = p_user
    and action = p_action
    and created_at > now() - interval '7 days';

  if (p_action = 'track' and used_day >= lim.tracks_per_day) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'tracks_per_day',
        hint = format('You can upload %s tracks per day.', lim.tracks_per_day);
  elsif (p_action = 'track' and used_week >= lim.tracks_per_week) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'tracks_per_week',
        hint = format('You can upload %s tracks per week.', lim.tracks_per_week);
  elsif (p_action = 'comment' and used_hour >= lim.comments_per_hour) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'comments_per_hour',
        hint = format('You can post %s comments per hour.', lim.comments_per_hour);
  elsif (p_action = 'report' and used_day >= lim.reports_per_day) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'reports_per_day',
        hint = format('You can send %s reports per day.', lim.reports_per_day);
  elsif (p_action = 'reaction' and used_hour >= lim.reactions_per_hour) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'reactions_per_hour',
        hint = format('You can add %s reactions per hour.', lim.reactions_per_hour);
  elsif (p_action = 'group_ask' and used_day >= 10) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'group_asks_per_day',
        hint = 'You can ask to join 10 groups a day.';
  elsif (p_action = 'group_create' and used_day >= 1) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'groups_per_day',
        hint = 'You can make one group a day.';
  end if;

  insert into private.rate_limit_events (user_id, action) values (p_user, p_action);
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_report uuid, p_status report_status, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if track is not null and not private.can_see_track(track, (select auth.uid())) then
    raise exception 'closed_needs_access' using errcode = '42501',
      detail = 'Open this track first.';
  end if;

  -- A dismissed report about group content: nothing came of the opening.
  if p_status = 'dismissed' and track is not null then
    perform private.record_access_outcome(track, 'none');
  end if;
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
$function$;

create or replace function private.purge_expired_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.track_upload_ips where created_at < now() - interval '30 days';
  delete from private.rate_limit_events where created_at < now() - interval '8 days';
  delete from private.play_events where created_at < now() - interval '2 days';
  delete from public.email_queue where sent_at < now() - interval '7 days';
  -- Nothing waits longer than three days.
  delete from public.email_queue where sent_at is null and created_at < now() - interval '3 days';
  delete from public.handle_history where changed_at < now() - interval '90 days';
  -- The log of openings of group content is kept for 12 months.
  delete from private.admin_access where created_at < now() - interval '12 months';
  -- A report outlives what it was about for 12 months after its decision;
  -- then its copy of the deleted text goes. The report itself stays.
  update public.reports set reported_text = '', details = ''
  where track_id is null and comment_id is null
    and status <> 'open'
    and resolved_at < now() - interval '12 months'
    and (reported_text <> '' or details <> '');
  -- One never decided keeps it for 12 months after it was made.
  update public.reports set reported_text = '', details = ''
  where track_id is null and comment_id is null
    and status = 'open'
    and created_at < now() - interval '12 months'
    and (reported_text <> '' or details <> '');
  -- A no to an ask matters for 7 days.
  delete from public.group_join_requests
  where status = 'declined' and decided_at < now() - interval '7 days';
$$;

CREATE OR REPLACE FUNCTION private.comments_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  version_duration integer;
  parent public.comments;
begin
  -- A group track answers like a missing one, before anything else can
  -- tell it apart (its replies, versions or length).
  if coalesce((select auth.jwt()) ->> 'role', '') = 'authenticated'
    and not private.can_take_part(new.track_id, (select auth.uid()))
  then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  new.body := btrim(new.body);

  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if not found
      or parent.track_id <> new.track_id
      or parent.parent_id is not null
      or parent.status <> 'live'
    then
      raise exception 'invalid_parent' using errcode = '22023';
    end if;
    -- A reply belongs to its parent's moment in the track, and version.
    new.time_ms := parent.time_ms;
    new.version_id := parent.version_id;
  end if;

  -- Comments go on live tracks only (RLS says the same). Checked here first,
  -- so a hidden track answers like a missing one.
  if coalesce((select auth.jwt()) ->> 'role', '') = 'authenticated'
    and not exists (select 1 from public.tracks where id = new.track_id and status = 'live')
  then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- A comment is about the version it was given on: the one sent, or the
  -- latest. It must belong to the same track.
  if new.version_id is null then
    select v.id into new.version_id from public.track_versions v
    where v.track_id = new.track_id order by v.version_no desc limit 1;
  end if;

  select v.duration_ms into version_duration from public.track_versions v
  where v.id = new.version_id and v.track_id = new.track_id;
  if not found then
    raise exception 'invalid_version' using errcode = '22023';
  end if;

  if new.time_ms is not null and new.time_ms > version_duration then
    raise exception 'time_out_of_range' using errcode = '22023';
  end if;

  if private.is_seeding() then
    return new;
  end if;

  new.is_helpful := false;
  new.helpful_at := null;
  new.resolved_at := null;
  new.edited_at := null;
  new.created_at := now();
  new.status := 'live';

  if exists (select 1 from public.profiles where id = new.author_id and banned_at is not null) then
    new.status := 'hidden';
  end if;

  perform private.consume_rate_limit(new.author_id, 'comment');

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_comment(p_comment uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid());
  admin boolean := public.is_admin();
  host boolean;
  c public.comments;
begin
  if uid is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into c from public.comments where id = p_comment for update;
  -- The owner of a group removes comments on the songs in it, as its host.
  host := not admin and c.id is not null and c.author_id is distinct from uid
    and exists (
      select 1 from public.tracks t
      join public.groups g on g.id = t.group_id
      join public.profiles p on p.id = g.owner_id
      where t.id = c.track_id and g.owner_id = uid and p.banned_at is null
    );
  if c.id is null
    or (not admin and not host and (c.author_id <> uid or c.status <> 'live'))
    or (host and c.status <> 'live')
    or (admin and c.status = 'withdrawn')
  then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Admins act on group content only after opening it.
  if admin and not private.can_see_track(c.track_id, uid) then
    raise exception 'closed_needs_access' using errcode = '42501',
      detail = 'Open this track first.';
  end if;
  if admin and c.author_id is distinct from uid then
    perform private.record_access_outcome(c.track_id, 'removed');
  end if;
  -- The group's owner removes a reported comment at once; its reports are
  -- settled. Its author waits for the review.
  if host then
    perform private.settle_reports_by_group_owner(null, c.id);
  elsif not admin
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
$function$;

-- Nothing in a group counts outside it: reputation, profile numbers, the
-- boost in trending and badges leave group songs out -------------------------

CREATE OR REPLACE FUNCTION private.compute_reputation(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rules public.trust_rules := private.trust_rules();
  total integer;
begin
  select coalesce(sum(least(per_giver.marks, rules.helpful_per_giver)), 0)
  into total
  from (
    select t.owner_id, count(*) as marks
    from public.comments c
    join public.tracks t on t.id = c.track_id
    join public.profiles g on g.id = t.owner_id
    where c.author_id = p_user
      and c.is_helpful
      and c.status = 'live'
      and t.status <> 'deleted'
      and t.group_id is null
      and private.helpful_giver_counts(g, rules)
    group by t.owner_id
  ) per_giver;
  return total;
end;
$function$;

CREATE OR REPLACE FUNCTION private.helpful_owner_count(p_user uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(distinct t.owner_id)::integer
  from public.comments c
  join public.tracks t on t.id = c.track_id
  join public.profiles g on g.id = t.owner_id
  cross join private.trust_rules() r
  where c.author_id = p_user
    and c.is_helpful
    and c.status = 'live'
    and t.status <> 'deleted'
      and t.group_id is null
    and private.helpful_giver_counts(g, r);
$function$;

CREATE OR REPLACE FUNCTION private.is_recent_giver(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.comments c
    join public.tracks t on t.id = c.track_id
    join public.profiles g on g.id = t.owner_id
    cross join private.trust_rules() r
    where c.author_id = p_user
      and c.is_helpful
      and c.status = 'live'
      and c.helpful_at > now() - interval '30 days'
      and t.status <> 'deleted'
      and t.group_id is null
      and private.helpful_giver_counts(g, r)
  );
$function$;

CREATE OR REPLACE FUNCTION public.profile_stats(p_user uuid)
 RETURNS TABLE(comments_given integer, helpful_received integer, helpful_share numeric, week_streak integer, badges badge_kind[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  given integer;
  helpful integer;
  streak integer := 0;
  week date;
begin
  if not exists (select 1 from public.profiles where id = p_user and banned_at is null) then
    return;
  end if;

  -- Comments on other people's tracks, the kind that can be Helpful.
  select count(*)::integer into given
  from public.comments c
  join public.tracks t on t.id = c.track_id
  where c.author_id = p_user and c.status = 'live' and t.status <> 'deleted' and t.owner_id <> p_user
    and t.group_id is null;

  -- Helpful that counts, the same number as reputation.
  helpful := private.compute_reputation(p_user);

  -- Weeks in a row with such a comment, counting back from this week, or
  -- from last week while this one has none yet.
  week := private.oslo_week_start(now());
  for i in 0..520 loop
    if exists (
      select 1 from public.comments c
      join public.tracks t on t.id = c.track_id
      where c.author_id = p_user
        and c.status = 'live'
        and t.status <> 'deleted'
        and t.group_id is null
        and t.owner_id <> p_user
        and c.created_at >= (week::timestamp at time zone 'Europe/Oslo')
        and c.created_at < ((week + 7)::timestamp at time zone 'Europe/Oslo')
    ) then
      streak := streak + 1;
    elsif i > 0 then
      exit;
    end if;
    week := week - 7;
  end loop;

  return query
  select given, helpful,
    case when given = 0 then 0 else round(least(helpful, given)::numeric / given, 3) end,
    streak,
    coalesce((select array_agg(b.badge order by b.awarded_at) from public.badges b where b.user_id = p_user), '{}');
end;
$function$;

CREATE OR REPLACE FUNCTION private.comments_award_first_ears()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner uuid;
begin
  select owner_id into owner from public.tracks where id = new.track_id and group_id is null;
  if owner is not null
    and new.status = 'live'
    and new.author_id <> owner
    and not exists (
      select 1 from public.comments c
      where c.track_id = new.track_id
        and c.id <> new.id
        and c.author_id <> owner
        and c.status = 'live'
    )
  then
    perform private.award_badge(new.author_id, 'first_ears');
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.track_versions_award_finisher()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner uuid;
begin
  if new.version_no < 2 then
    return null;
  end if;
  select owner_id into owner from public.tracks where id = new.track_id and group_id is null;
  if owner is not null and exists (
    select 1 from public.comments c
    where c.track_id = new.track_id and c.author_id <> owner and c.status = 'live'
  ) then
    perform private.award_badge(owner, 'finisher');
  end if;
  return null;
end;
$function$;

-- A song in a group goes with its comments when its group owner removes
-- it (private.delete_group_track).

CREATE OR REPLACE FUNCTION private.comments_before_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce((select auth.jwt()) ->> 'role', '') = 'authenticated'
    and current_setting('needears.deleting_track', true) is distinct from old.track_id::text
  then
    if not public.is_admin()
      and exists (select 1 from public.reports where comment_id = old.id and status = 'open')
    then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'This comment is under review and cannot be deleted now.';
    end if;
    if current_setting('needears.deleting', true) is distinct from old.id::text
      and exists (select 1 from public.comments r where r.parent_id = old.id)
    then
      raise exception 'has_replies' using errcode = '22023',
        detail = 'Use delete_comment() for a comment with replies.';
    end if;
  end if;
  return old;
end;
$function$;

-- Grants -----------------------------------------------------------------------

revoke execute on all functions in schema access from public;
grant execute on function access.can_see_track(public.tracks) to anon, authenticated;
grant execute on function access.can_see_track(uuid) to anon, authenticated;
grant execute on function access.is_group_member(uuid) to anon, authenticated;
grant execute on function access.can_take_part(uuid) to anon, authenticated;
grant execute on function access.can_see_report(public.reports) to authenticated;

revoke execute on function private.is_group_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.admin_has_access(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.can_see_track(public.tracks, uuid) from public, anon, authenticated;
revoke execute on function private.can_see_track(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.can_take_part(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.report_track(public.reports) from public, anon, authenticated;
revoke execute on function private.reports_mark_in_group() from public, anon, authenticated;
revoke execute on function private.reports_forget_group_text() from public, anon, authenticated;
revoke execute on function private.notifications_only_visible() from public, anon, authenticated;
revoke execute on function private.groups_before_write() from public, anon, authenticated;
revoke execute on function private.group_members_count() from public, anon, authenticated;
revoke execute on function private.tracks_group_rules() from public, anon, authenticated;
revoke execute on function private.track_versions_group_rule() from public, anon, authenticated;
revoke execute on function private.group_member_cap() from public, anon, authenticated;
revoke execute on function private.owned_group(uuid) from public, anon, authenticated;
revoke execute on function private.forget_group_notices(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.track_files(uuid) from public, anon, authenticated;
revoke execute on function private.delete_group_track(uuid) from public, anon, authenticated;
revoke execute on function private.settle_reports_by_group_owner(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.groups_before_delete() from public, anon, authenticated;
revoke execute on function private.record_access_outcome(uuid, text) from public, anon, authenticated;
revoke execute on function private.tracks_record_removal() from public, anon, authenticated;
revoke execute on function private.comments_before_insert() from public, anon, authenticated;
revoke execute on function private.purge_expired_data() from public, anon, authenticated;
revoke execute on function public.delete_comment(uuid) from public, anon;
grant execute on function public.delete_comment(uuid) to authenticated, service_role;

revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.search_groups(text, integer) from public;
revoke execute on function public.is_group_track(text) from public;
revoke execute on function public.my_groups() from public, anon;
revoke execute on function public.my_group_removals() from public, anon;
revoke execute on function public.group_status(uuid) from public;
revoke execute on function public.my_group_tracks() from public, anon;
revoke execute on function public.ask_to_join(uuid) from public, anon;
revoke execute on function public.withdraw_ask(uuid) from public, anon;
revoke execute on function public.answer_ask(uuid, uuid, boolean) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.remove_track_from_group(uuid) from public, anon;
revoke execute on function public.delete_group(uuid) from public, anon;
revoke execute on function public.admin_open_closed(uuid, text, uuid, text) from public, anon;
revoke execute on function public.admin_closed_reports() from public, anon;
grant execute on function public.create_group(text) to authenticated, service_role;
grant execute on function public.search_groups(text, integer) to anon, authenticated, service_role;
grant execute on function public.is_group_track(text) to anon, authenticated, service_role;
grant execute on function public.my_groups() to authenticated, service_role;
grant execute on function public.my_group_removals() to authenticated, service_role;
grant execute on function public.group_status(uuid) to anon, authenticated, service_role;
grant execute on function public.my_group_tracks() to authenticated, service_role;
grant execute on function public.ask_to_join(uuid) to authenticated, service_role;
grant execute on function public.withdraw_ask(uuid) to authenticated, service_role;
grant execute on function public.answer_ask(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.leave_group(uuid) to authenticated, service_role;
grant execute on function public.remove_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.remove_track_from_group(uuid) to authenticated, service_role;
grant execute on function public.delete_group(uuid) to authenticated, service_role;
grant execute on function public.admin_open_closed(uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.admin_closed_reports() to authenticated, service_role;
grant select on public.groups, public.group_members, public.group_join_requests to service_role;
grant insert, update, delete on public.groups, public.group_members, public.group_join_requests
  to service_role;
