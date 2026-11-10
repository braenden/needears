-- Two fixes from a review before launch.
--
-- 1. Trending counts each person once per track. Every comment used to add
--    to a track's score, so one account could lift a track to the top by
--    posting many comments on it. Now a person's newest comment on a track
--    is the one that counts, like one reaction per person already does.
-- 2. A banned person cannot change their username, display name or bio, or
--    point their picture somewhere else. The ban already stopped links,
--    "working on", DAW and uploaded pictures; the name and bio were left
--    open, so a banned account could still rename itself. Removing the
--    picture that came from Google stays allowed: it is a picture of them.

-- 1. Trending -----------------------------------------------------------------

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

-- 2. Banned profiles ----------------------------------------------------------

create or replace function private.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.handle := lower(btrim(new.handle));
  new.display_name := btrim(new.display_name);
  new.bio := btrim(new.bio);
  new.working_on := btrim(new.working_on);
  new.daw := btrim(new.daw);

  if tg_op = 'INSERT' and new.avatar_url !~ '^https://lh3\.googleusercontent\.com/' then
    new.avatar_url := null;
  end if;

  if (tg_op = 'INSERT' or new.handle is distinct from old.handle)
    and exists (select 1 from public.reserved_handles where handle = new.handle)
  then
    raise exception 'handle_reserved' using errcode = '22023';
  end if;

  -- A banned person cannot change what others see on their profile: not the
  -- name and bio either. Taking away the picture that came from Google is
  -- still theirs to do; pointing it somewhere else is not.
  if tg_op = 'UPDATE'
    and old.banned_at is not null
    and coalesce((select auth.jwt()) ->> 'role', '') = 'authenticated'
    and (
      (new.handle, new.display_name, new.bio,
       new.links, new.working_on, new.daw, new.avatar_key)
        is distinct from (old.handle, old.display_name, old.bio,
          old.links, old.working_on, old.daw, old.avatar_key)
      or (new.avatar_url is not null and new.avatar_url is distinct from old.avatar_url)
    )
  then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or new.links is distinct from old.links then
    new.links := private.normalize_links(new.links);
  end if;

  -- An uploaded picture must be in the person's folder, uploaded by them,
  -- and within the bucket limits (a copied file is not checked by Storage).
  if new.avatar_key is not null
    and (tg_op = 'INSERT' or new.avatar_key is distinct from old.avatar_key)
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'avatars'
        and o.name = new.avatar_key
        and o.owner_id = new.id::text
        and (o.metadata ->> 'size')::bigint between 1 and 524288
        and o.metadata ->> 'mimetype' in ('image/jpeg', 'image/webp')
    )
  then
    raise exception 'avatar_missing' using errcode = '22023';
  end if;

  return new;
end;
$$;
