-- Comments on a range, reference tracks, and marker export.
--
-- comments.end_ms: a comment can cover a stretch (1:42 to 1:58) instead of
-- one point. It needs a start, must end after it and within the version's
-- length. Replies share their parent's range, and move with it.
--
-- tracks.reference_url: a link to a track the uploader is aiming for. The
-- same https host list as profile links (link_hosts, src/config/profile.ts).
--
-- The marker export (GET /api/tracks/[id]/markers) reads comments through
-- RLS and needs nothing new here.

alter table public.comments add column end_ms integer check (end_ms > 0);

grant insert (end_ms) on public.comments to authenticated;
grant update (end_ms) on public.comments to authenticated;

-- Runs after comments_before_insert and comments_before_update (trigger
-- names sort that way), so time_ms and version_id are settled.
create function private.comments_check_range()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_duration integer;
begin
  if new.parent_id is not null then
    select p.end_ms into new.end_ms from public.comments p where p.id = new.parent_id;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.end_ms is distinct from old.end_ms
    and coalesce((select auth.jwt()) ->> 'role', '') = 'authenticated'
    and (select auth.uid()) is distinct from old.author_id
  then
    raise exception 'not_allowed' using errcode = '42501',
      detail = 'Only the author can edit a comment.';
  end if;

  if new.end_ms is not null then
    select duration_ms into version_duration from public.track_versions where id = new.version_id;
    if new.time_ms is null or new.end_ms <= new.time_ms or new.end_ms > version_duration then
      raise exception 'invalid_range' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.end_ms is distinct from old.end_ms then
    new.edited_at := now();
  end if;

  return new;
end;
$$;

create trigger comments_check_range
  before insert or update on public.comments
  for each row execute function private.comments_check_range();

-- Replies move with their parent's time and range.
create or replace function private.comments_move_replies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.comments set time_ms = new.time_ms, end_ms = new.end_ms
  where parent_id = new.id
    and (time_ms, end_ms) is distinct from (new.time_ms, new.end_ms);
  return null;
end;
$$;

drop trigger comments_move_replies on public.comments;
create trigger comments_move_replies
  after update of time_ms, end_ms on public.comments
  for each row
  when (old.parent_id is null and (new.time_ms, new.end_ms) is distinct from (old.time_ms, old.end_ms))
  execute function private.comments_move_replies();

-- Reference track ------------------------------------------------------------

alter table public.tracks add column reference_url text;

grant update (reference_url) on public.tracks to authenticated;

create function private.tracks_check_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.reference_url := nullif(btrim(new.reference_url), '');
  if new.reference_url is not null and not private.link_url_allowed(new.reference_url) then
    raise exception 'invalid_link' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger tracks_check_reference
  before insert or update of reference_url on public.tracks
  for each row execute function private.tracks_check_reference();

revoke execute on function private.comments_check_range() from public, anon, authenticated;
revoke execute on function private.comments_move_replies() from public, anon, authenticated;
revoke execute on function private.tracks_check_reference() from public, anon, authenticated;
