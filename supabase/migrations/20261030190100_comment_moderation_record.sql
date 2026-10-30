-- Comment moderation record.
--
-- 1. Authors may only delete their own live comments. Deleting a hidden
--    (reported) or moderated comment also deleted every report on it
--    (reports.comment_id cascades), so a harasser could erase the evidence
--    before an admin looked. Moderated comments now stay as a record, the
--    same rule tracks already follow. Deleting the account still removes
--    everything.
-- 2. Replies need a live parent, so nobody can reply under a hidden or
--    removed comment (and notify its author) by guessing its id.
-- 3. Editing the body of a comment marked Helpful clears the mark. The
--    track owner marked the text they read, and reputation (which sets the
--    rate limits) should not survive the text being swapped for something
--    else.

drop policy "Authors and admins delete comments" on public.comments;

create policy "Authors delete live comments, admins any" on public.comments
  for delete to authenticated
  using (
    (author_id = (select auth.uid()) and status = 'live')
    or (select public.is_admin())
  );

create or replace function private.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  track_duration integer;
  parent public.comments;
begin
  new.body := btrim(new.body);

  select duration_ms into track_duration from public.tracks where id = new.track_id;
  if new.time_ms is not null and new.time_ms > track_duration then
    raise exception 'time_out_of_range' using errcode = '22023';
  end if;

  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if not found
      or parent.track_id <> new.track_id
      or parent.parent_id is not null
      or parent.status <> 'live'
    then
      raise exception 'invalid_parent' using errcode = '22023';
    end if;
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
$$;

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
  if coalesce((select auth.jwt()) ->> 'role', '') not in ('authenticated', 'anon') then
    if new.is_helpful and not old.is_helpful then
      new.helpful_at := coalesce(new.helpful_at, now());
    elsif not new.is_helpful then
      new.helpful_at := null;
    end if;
    return new;
  end if;

  select owner_id into track_owner from public.tracks where id = old.track_id;

  if (new.body, new.category, new.time_ms) is distinct from (old.body, old.category, old.time_ms) then
    if uid is distinct from old.author_id then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only the author can edit a comment.';
    end if;
    new.body := btrim(new.body);
    if new.time_ms is not null
      and new.time_ms > (select duration_ms from public.tracks where id = old.track_id)
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
    new.resolved_at := case when new.resolved_at is not null then now() end;
  end if;

  return new;
end;
$$;

revoke execute on function private.comments_before_insert() from public, anon, authenticated;
revoke execute on function private.comments_before_update() from public, anon, authenticated;
