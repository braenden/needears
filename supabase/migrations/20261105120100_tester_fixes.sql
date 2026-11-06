-- Fixes from a usability test.
--
-- 1. Latest is newest published first. It used to move tracks of recent
--    givers six hours up, so the times on the cards jumped around.
-- 2. Search finds an artist's tracks by their handle or display name too.
-- 3. Needs ears leaves out the signed in person's own tracks.
-- 4. Authors delete their own comments with delete_comment(). A comment
--    with replies keeps its place in the thread as "withdrawn": the text,
--    the author and the Helpful mark are gone, the replies stay. Without
--    replies it is deleted. Withdrawn comments are not live, so every count
--    (comment_count, the listener counts, has_helpful, reputation,
--    trending) leaves them out, their notifications go, and they cannot be
--    replied to or reported. A withdrawn comment whose last reply is
--    deleted goes too. Editing stays as it was: authors edit their own live
--    comments.
-- 5. Old handles: when someone changes their handle, the old one points to
--    the profile (resolve_old_handle) for 90 days, or until someone else
--    takes it. At most five per person are kept, and people see their own
--    in their data export.

-- search() below sets a pg_trgm parameter, which only an owner of the
-- loaded extension may set. A pg_trgm call loads it in this session (a
-- fresh session, as on a database push, has not loaded it yet).
select extensions.similarity('a', 'b');

-- 1. Latest ----------------------------------------------------------------

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
  order by t.published_at desc, t.id
  limit least(greatest(p_page_size, 1), 50)
  offset (least(greatest(p_page, 1), 50) - 1) * least(greatest(p_page_size, 1), 50);
$$;

-- 3. Needs ears without your own tracks --------------------------------------

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
  where t.needs_ears
    and t.owner_id is distinct from (select auth.uid())
    and (p_genre is null or t.genre_id = (select g.id from public.genres g where g.slug = p_genre))
  order by t.published_at desc, t.id
  limit least(greatest(p_page_size, 1), 50)
  offset (least(greatest(p_page, 1), 50) - 1) * least(greatest(p_page_size, 1), 50);
$$;

-- 2. Search ----------------------------------------------------------------

-- Tracks match on their title and tags, and on their artist's handle and
-- display name. A track found through its artist ranks a little below the
-- artist's profile, and an artist's tracks come newest first.
create or replace function public.search(p_query text, p_limit integer default 20)
returns table (
  kind text,
  id uuid,
  slug text,
  title text,
  handle text,
  display_name text,
  rank real
)
language plpgsql
stable
security invoker
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.3
set statement_timeout = '500ms'
as $$
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

  return query
  with people as (
    select p.id, p.handle, p.display_name,
      greatest(
        extensions.word_similarity(q, p.handle),
        extensions.word_similarity(q, lower(p.display_name))
      ) as rank
    from public.profiles p
    where p.banned_at is null
      and (
        q operator(extensions.<%) p.handle
        or q operator(extensions.<%) lower(p.display_name)
      )
    order by 4 desc, p.handle
    limit n
  ),
  track_hits as (
    select t.id,
      greatest(
        extensions.word_similarity(q, lower(t.title)),
        extensions.word_similarity(q, public.tags_text(t.tags))
      ) as rank
    from public.tracks t
    where t.status = 'live'
      and (
        q operator(extensions.<%) lower(t.title)
        or q operator(extensions.<%) public.tags_text(t.tags)
      )
    union all
    select t.id, (pe.rank * 0.9)::real
    from people pe
    join public.tracks t on t.owner_id = pe.id
    where t.status = 'live'
  ),
  tracks_ranked as (
    select 'track'::text as kind, t.id, t.slug, t.title, p.handle, p.display_name,
      max(h.rank)::real as rank, t.published_at
    from track_hits h
    join public.tracks t on t.id = h.id
    join public.profiles p on p.id = t.owner_id
    where p.banned_at is null
    group by t.id, t.slug, t.title, p.handle, p.display_name, t.published_at
    order by 7 desc, t.published_at desc
    limit n
  )
  select r.kind, r.id, r.slug, r.title, r.handle, r.display_name, r.rank
  from (
    select tr.kind, tr.id, tr.slug, tr.title, tr.handle, tr.display_name, tr.rank, tr.published_at
    from tracks_ranked tr
    union all
    select 'profile'::text, pe.id, null::text, null::text, pe.handle, pe.display_name,
      pe.rank::real, null::timestamptz
    from people pe
  ) r
  order by r.rank desc, r.kind desc, r.published_at desc nulls last
  limit n;
end;
$$;

-- 4. Deleting your own comment ---------------------------------------------

-- A withdrawn comment belongs to nobody.
alter table public.comments alter column author_id drop not null;
alter table public.comments add constraint comments_author_set
  check (author_id is not null or status = 'withdrawn');

alter table public.comments drop constraint comments_body_check;
alter table public.comments add constraint comments_body_check check (
  case when status = 'withdrawn'
    then body = ''
    else char_length(btrim(body)) between 1 and 2000
  end
);

-- Withdrawn comments stay visible as a gap in their thread.
drop policy "Live comments on visible tracks are public" on public.comments;
create policy "Live and withdrawn comments on visible tracks are public" on public.comments
  for select to anon, authenticated
  using (
    status in ('live', 'withdrawn')
    and exists (select 1 from public.tracks t where t.id = comments.track_id)
  );

-- The same as before, and the withdrawal by delete_comment() passes without
-- the author and owner checks (it already made them).
create or replace function private.comments_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  track_owner uuid;
  body_changed boolean := false;
begin
  if new.status = 'withdrawn' and old.status = 'live'
    and current_setting('needears.withdrawing', true) = old.id::text
  then
    return new;
  end if;

  -- Replies always sit at their parent's current time, whoever writes.
  if old.parent_id is not null then
    select p.time_ms into new.time_ms from public.comments p where p.id = old.parent_id;
  end if;

  if coalesce((select auth.jwt()) ->> 'role', '') not in ('authenticated', 'anon') then
    if new.is_helpful and not old.is_helpful then
      new.helpful_at := coalesce(new.helpful_at, now());
    elsif not new.is_helpful then
      new.helpful_at := null;
    end if;
    return new;
  end if;

  select owner_id into track_owner from public.tracks where id = old.track_id;

  -- For a reply the time follows the parent and is not an edit.
  if (new.body, new.category) is distinct from (old.body, old.category)
    or (old.parent_id is null and new.time_ms is distinct from old.time_ms)
  then
    if uid is distinct from old.author_id then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only the author can edit a comment.';
    end if;
    new.body := btrim(new.body);
    if new.time_ms is not null
      and new.time_ms > (select duration_ms from public.track_versions where id = old.version_id)
    then
      raise exception 'time_out_of_range' using errcode = '22023';
    end if;
    new.edited_at := now();
    body_changed := new.body is distinct from old.body;
  end if;

  if new.is_helpful is distinct from old.is_helpful then
    if uid is distinct from track_owner then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only the track owner can mark a comment as Helpful.';
    end if;
    if old.author_id = track_owner then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'You cannot mark your own comment as Helpful.';
    end if;
    new.helpful_at := case when new.is_helpful then now() end;
  else
    new.helpful_at := old.helpful_at;
  end if;

  -- A new text has not been judged Helpful yet.
  if body_changed and old.is_helpful then
    new.is_helpful := false;
    new.helpful_at := null;
  end if;

  if new.resolved_at is distinct from old.resolved_at then
    if uid is distinct from track_owner then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only the track owner can resolve a comment.';
    end if;
    if old.parent_id is not null then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only top level comments can be resolved.';
    end if;
    new.resolved_at := case when new.resolved_at is not null then now() end;
  end if;

  return new;
end;
$$;

-- A signed in person deletes comments with replies through delete_comment(),
-- so the replies keep their thread. Under review, only admins delete.
create or replace function private.comments_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()) ->> 'role', '') = 'authenticated' then
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
$$;

-- Deletes a comment of the caller (or any, for admins). Returns 'deleted',
-- or 'withdrawn' when replies keep it in the thread without its text.
create function public.delete_comment(p_comment uuid)
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
      is_helpful = false, helpful_at = null
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

-- A withdrawn comment goes with its last reply, unless it is under review.
create function private.comments_remove_empty_withdrawn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Replies deleted at the same moment take turns, so the last one sees
  -- that none are left.
  perform 1 from public.comments where id = old.parent_id for update;
  perform set_config('needears.deleting', old.parent_id::text, true);
  delete from public.comments p
  where p.id = old.parent_id
    and p.status = 'withdrawn'
    and not exists (select 1 from public.comments r where r.parent_id = p.id)
    and not exists (select 1 from public.reports rp where rp.comment_id = p.id and rp.status = 'open');
  perform set_config('needears.deleting', '', true);
  return null;
end;
$$;

create trigger comments_remove_empty_withdrawn
  after delete on public.comments
  for each row
  when (old.parent_id is not null)
  execute function private.comments_remove_empty_withdrawn();

-- A reply waits for a withdrawal of its parent that is under way, and then
-- finds the parent no longer live.
create function private.comments_lock_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.comments
  where id = new.parent_id and status = 'live'
  for share;
  if not found then
    raise exception 'invalid_parent' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger comments_lock_parent
  before insert on public.comments
  for each row
  when (new.parent_id is not null)
  execute function private.comments_lock_parent();

-- Only live comments can be reported.
drop policy "Users report what they can see" on public.reports;
create policy "Users report what they can see" on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (
      (target_type = 'track'
        and exists (select 1 from public.tracks t where t.id = reports.track_id))
      or (target_type = 'comment'
        and exists (
          select 1 from public.comments c
          where c.id = reports.comment_id and c.status = 'live'
        ))
    )
  );

-- 5. Old handles -------------------------------------------------------------

create table public.handle_history (
  handle text primary key check (handle ~ '^[a-z0-9_]{3,20}$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  changed_at timestamptz not null default now()
);

create index handle_history_profile_id_idx on public.handle_history (profile_id, changed_at desc);

alter table public.handle_history enable row level security;
revoke all on public.handle_history from anon, authenticated;
grant select on public.handle_history to authenticated;

-- For the data export.
create policy "People see their own old handles" on public.handle_history
  for select to authenticated using (profile_id = (select auth.uid()));

create function private.profiles_keep_old_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A handle in use is nobody's old handle.
  delete from public.handle_history where handle = new.handle;

  if tg_op = 'UPDATE' and old.handle is distinct from new.handle then
    insert into public.handle_history (handle, profile_id)
    values (old.handle, new.id)
    on conflict (handle) do update
      set profile_id = excluded.profile_id, changed_at = now();
    delete from public.handle_history
    where profile_id = new.id
      and handle not in (
        select h.handle from public.handle_history h
        where h.profile_id = new.id
        order by h.changed_at desc
        limit 5
      );
  end if;
  return null;
end;
$$;

create trigger profiles_keep_old_handle
  after insert or update of handle on public.profiles
  for each row execute function private.profiles_keep_old_handle();

-- Old handles are forgotten after 90 days.
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
$$;

-- The current handle of whoever used `p_handle` in the last 90 days, or
-- null. Banned profiles are not looked up.
create function public.resolve_old_handle(p_handle text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.handle
  from public.handle_history h
  join public.profiles p on p.id = h.profile_id
  where h.handle = lower(btrim(p_handle))
    and h.changed_at > now() - interval '90 days'
    and p.banned_at is null;
$$;

revoke execute on function public.delete_comment(uuid) from public, anon;
revoke execute on function public.resolve_old_handle(text) from public;
revoke execute on function private.comments_before_update() from public, anon, authenticated;
revoke execute on function private.comments_before_delete() from public, anon, authenticated;
revoke execute on function private.comments_remove_empty_withdrawn() from public, anon, authenticated;
revoke execute on function private.profiles_keep_old_handle() from public, anon, authenticated;
revoke execute on function private.comments_lock_parent() from public, anon, authenticated;
revoke execute on function private.purge_expired_data() from public, anon, authenticated;
grant execute on function public.delete_comment(uuid) to authenticated, service_role;
grant execute on function public.resolve_old_handle(text) to anon, authenticated, service_role;
