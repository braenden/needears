-- What "Needs ears" means, and comment counts without the artist.
--
-- A live track needs ears until the artist has marked a comment by someone
-- else as Helpful, or three different people other than the artist have
-- left a live comment (top level or reply, on any version). Before, it was
-- comment_count <= 1, which counted replies, the artist's own comments and
-- comments on older versions.
--
-- Kept on tracks by the comment triggers, so the feed and the cards read
-- them without counting:
--
-- - listener_count: different people other than the artist with a live
--   comment on the track.
-- - listener_comment_count: live comments by people other than the
--   artist, on every version. The number the track card shows.
-- - has_helpful: a live comment by someone else is marked Helpful.
-- - needs_ears: the rule above, for live tracks.
--
-- comment_count stays as it was (every live comment, the artist's too).

alter table public.tracks
  add column listener_count integer not null default 0 check (listener_count >= 0),
  add column listener_comment_count integer not null default 0 check (listener_comment_count >= 0),
  add column has_helpful boolean not null default false,
  add column needs_ears boolean generated always as (
    status = 'live' and not has_helpful and listener_count < 3
  ) stored;

create function private.refresh_listener_stats(p_track uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tracks t
  set listener_count = s.listeners,
    listener_comment_count = s.comments,
    has_helpful = s.helpful
  from (
    select
      count(distinct c.author_id)::integer as listeners,
      count(c.id)::integer as comments,
      coalesce(bool_or(c.is_helpful), false) as helpful
    from public.tracks tr
    left join public.comments c
      on c.track_id = tr.id
      and c.status = 'live'
      and c.author_id <> tr.owner_id
    where tr.id = p_track
  ) s
  where t.id = p_track
    and (t.listener_count, t.listener_comment_count, t.has_helpful)
      is distinct from (s.listeners, s.comments, s.helpful);
$$;

create or replace function private.comments_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Comments written at the same moment take turns here, so each count
  -- below sees the others (every statement gets a fresh snapshot). No key
  -- update does not conflict with the key share lock the comment's foreign
  -- key already holds.
  perform 1 from public.tracks
  where id = case when tg_op = 'DELETE' then old.track_id else new.track_id end
  for no key update;

  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      perform private.refresh_comment_count(new.track_id);
    end if;
    if tg_op = 'INSERT'
      or new.status is distinct from old.status
      or new.is_helpful is distinct from old.is_helpful
    then
      perform private.refresh_listener_stats(new.track_id);
    end if;
    if (tg_op = 'INSERT' and new.is_helpful)
      or (tg_op = 'UPDATE'
        and (new.is_helpful is distinct from old.is_helpful
          or (old.is_helpful and new.status is distinct from old.status)))
    then
      perform private.refresh_reputation(new.author_id);
    end if;
  else
    perform private.refresh_comment_count(old.track_id);
    perform private.refresh_listener_stats(old.track_id);
    if old.is_helpful then
      perform private.refresh_reputation(old.author_id);
    end if;
  end if;
  return null;
end;
$$;

-- The counters start at zero whoever inserts the row.
create function private.tracks_reset_listener_stats()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.listener_count := 0;
  new.listener_comment_count := 0;
  new.has_helpful := false;
  return new;
end;
$$;

create trigger tracks_reset_listener_stats
  before insert on public.tracks
  for each row execute function private.tracks_reset_listener_stats();

-- Existing tracks.
do $$
declare
  r record;
begin
  for r in select id from public.tracks loop
    perform private.refresh_listener_stats(r.id);
  end loop;
end;
$$;

drop index public.tracks_needs_ears_idx;
create index tracks_needs_ears_idx on public.tracks (published_at desc) where needs_ears;

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
    and (p_genre is null or t.genre_id = (select g.id from public.genres g where g.slug = p_genre))
  order by t.published_at desc, t.id
  limit least(greatest(p_page_size, 1), 50)
  offset (least(greatest(p_page, 1), 50) - 1) * least(greatest(p_page_size, 1), 50);
$$;

revoke execute on function private.refresh_listener_stats(uuid) from public, anon, authenticated;
revoke execute on function private.comments_after_write() from public, anon, authenticated;
revoke execute on function private.tracks_reset_listener_stats() from public, anon, authenticated;
