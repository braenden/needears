-- Replies and Resolved.
--
-- Replies are one level deep and need a live parent on the same track
-- (already enforced). They now take their parent's time and keep it, so a
-- thread sits at one point in the waveform.
--
-- Resolved: only the track owner sets or clears it (already enforced), and
-- only on top level comments. A reply is resolved with its thread. A check
-- constraint holds that for every writer.
--
-- When the author moves a top level comment, its replies move with it.

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

  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if not found
      or parent.track_id <> new.track_id
      or parent.parent_id is not null
      or parent.status <> 'live'
    then
      raise exception 'invalid_parent' using errcode = '22023';
    end if;
    -- A reply belongs to its parent's moment in the track.
    new.time_ms := parent.time_ms;
  end if;

  select duration_ms into track_duration from public.tracks where id = new.track_id;
  if new.time_ms is not null and new.time_ms > track_duration then
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
    if old.parent_id is not null then
      raise exception 'not_allowed' using errcode = '42501',
        detail = 'Only top level comments can be resolved.';
    end if;
    new.resolved_at := case when new.resolved_at is not null then now() end;
  end if;

  return new;
end;
$$;

create function private.comments_move_replies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.comments set time_ms = new.time_ms
  where parent_id = new.id and time_ms is distinct from new.time_ms;
  return null;
end;
$$;

create trigger comments_move_replies
  after update of time_ms on public.comments
  for each row
  when (old.parent_id is null and new.time_ms is distinct from old.time_ms)
  execute function private.comments_move_replies();

-- Existing replies: take the parent's time and drop Resolved.
update public.comments c
set time_ms = p.time_ms, resolved_at = null
from public.comments p
where c.parent_id = p.id
  and (c.time_ms is distinct from p.time_ms or c.resolved_at is not null);

alter table public.comments
  add constraint comments_resolved_top_level check (parent_id is null or resolved_at is null);

revoke execute on function private.comments_before_insert() from public, anon, authenticated;
revoke execute on function private.comments_before_update() from public, anon, authenticated;
revoke execute on function private.comments_move_replies() from public, anon, authenticated;
