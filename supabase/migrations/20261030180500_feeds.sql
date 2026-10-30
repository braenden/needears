-- Feed queries as SQL functions, so ranking lives next to the data and is
-- easy to read in one place. All three return live tracks only, accept an
-- optional genre slug, and page with p_page (1 based) and p_page_size
-- (1 to 50). They return `setof tracks`, so PostgREST can embed the owner:
--   rpc('feed_latest', { p_page: 2 }).select('*, owner:profiles!tracks_owner_id_fkey(handle, display_name, avatar_url, reputation)')

-- Givers: users with a comment marked Helpful in the last 30 days. Their
-- tracks get a small lift in Latest and Trending ("Give feedback, and your
-- tracks get seen more").
create function private.is_recent_giver(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.comments
    where author_id = p_user
      and is_helpful
      and status = 'live'
      and helpful_at > now() - interval '30 days'
  );
$$;

-- Needs ears: tracks with zero or one comment, newest first.
create function public.feed_needs_ears(
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
  offset (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 50);
$$;

-- Latest: newest first, with tracks from recent givers treated as if they
-- were published six hours later.
create function public.feed_latest(
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
  offset (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 50);
$$;

-- Trending: activity in the last 7 days. Each comment counts 2 and each
-- reaction 1, and every event decays with a half life of 48 hours. The
-- owner's own comments and reactions do not count. The score is divided by
-- the track's age so old tracks do not stay on top, and recent givers get
-- a 20 percent lift.
--
-- Security definer because reactions are private per user. It only returns
-- live tracks and aggregate scores, never who reacted.
create function public.feed_trending(
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
  offset (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 50);
$$;

revoke execute on function private.is_recent_giver(uuid) from public, anon, authenticated;
revoke execute on function public.feed_needs_ears(text, integer, integer) from public;
revoke execute on function public.feed_latest(text, integer, integer) from public;
revoke execute on function public.feed_trending(text, integer, integer) from public;
grant execute on function public.feed_needs_ears(text, integer, integer) to anon, authenticated;
grant execute on function public.feed_latest(text, integer, integer) to anon, authenticated;
grant execute on function public.feed_trending(text, integer, integer) to anon, authenticated;
