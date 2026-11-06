-- Two follow ups from a hands on check.
--
-- 1. Search ranks in tiers: an exact match on an artist's handle or display
--    name, a track title or a tag first, then a match at the start of a
--    word, then fuzzy matches. Fuzzy matches (for typos) only come back when
--    nothing matches exactly or at the start of a word, so searching "nora"
--    no longer lists a track tagged "noise".
-- 2. Nobody posts before choosing a username. profiles.onboarded_at is set
--    the first time the person saves their handle (the welcome page does
--    that), and comments, replies, reactions, Helpful marks, uploads and new
--    versions are refused with handle_required until then. Reports stay
--    open, so anyone can report abuse. Existing accounts that finished the
--    welcome page count as done. Profiles without a chosen username are
--    left out of search.

-- search() below sets a pg_trgm parameter, which may only be set once the
-- extension is loaded in this session.
select extensions.similarity('a', 'b');

-- 2. A chosen username --------------------------------------------------------

alter table public.profiles add column onboarded_at timestamptz;

update public.profiles p
set onboarded_at = coalesce(p.created_at, now())
from auth.users u
where u.id = p.id
  and coalesce(u.raw_user_meta_data ->> 'onboarded', '') = 'true';

-- Saving a handle (even the suggested one) is choosing it. Fixtures are done
-- from the start.
create function private.profiles_mark_onboarded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.onboarded_at := case when private.is_seeding() then coalesce(new.onboarded_at, now()) end;
  elsif old.onboarded_at is null then
    new.onboarded_at := now();
  else
    new.onboarded_at := old.onboarded_at;
  end if;
  return new;
end;
$$;

create trigger profiles_mark_onboarded_insert
  before insert on public.profiles
  for each row execute function private.profiles_mark_onboarded();

create trigger profiles_mark_onboarded
  before update of handle on public.profiles
  for each row execute function private.profiles_mark_onboarded();

-- Nobody but these triggers writes it: users have no grant on the column.

create function private.require_handle(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is null or private.is_seeding() then
    return;
  end if;
  if exists (select 1 from public.profiles where id = p_user and onboarded_at is null) then
    raise exception 'handle_required' using errcode = '42501',
      detail = 'Choose a username first.';
  end if;
end;
$$;

create function private.comments_require_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.require_handle(new.author_id);
  elsif new.is_helpful is distinct from old.is_helpful and new.is_helpful then
    -- The one marking Helpful is the track owner.
    perform private.require_handle((select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger comments_require_handle
  before insert or update of is_helpful on public.comments
  for each row execute function private.comments_require_handle();

create function private.require_handle_of_user_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_handle(new.user_id);
  return new;
end;
$$;

-- Reactions, and upload reservations: an upload is refused before the file
-- is sent, not after.
create trigger reactions_require_handle
  before insert or update of kind on public.reactions
  for each row execute function private.require_handle_of_user_id();

create trigger upload_reservations_require_handle
  before insert on private.upload_reservations
  for each row execute function private.require_handle_of_user_id();

create function private.tracks_require_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_handle(new.owner_id);
  return new;
end;
$$;

create trigger tracks_require_handle
  before insert on public.tracks
  for each row execute function private.tracks_require_handle();

create function private.track_versions_require_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_handle((select owner_id from public.tracks where id = new.track_id));
  return new;
end;
$$;

create trigger track_versions_require_handle
  before insert on public.track_versions
  for each row execute function private.track_versions_require_handle();

-- 1. Search ------------------------------------------------------------------

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

  -- Tier 3: the whole handle, display name, title or a tag. Tier 2: the
  -- start of the handle, or of a word in the display name or title. Tier 1:
  -- similar (word similarity), for typos. The rank is the tier plus the
  -- similarity, and a track found through its artist ranks just below the
  -- artist.
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
      and (
        q operator(extensions.<%) lower(t.title)
        or q operator(extensions.<%) public.tags_text(t.tags)
      )
    union all
    select t.id, pe.tier, pe.sim - 0.1
    from people pe
    join public.tracks t on t.owner_id = pe.id
    where t.status = 'live'
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
$$;

revoke execute on function private.profiles_mark_onboarded() from public, anon, authenticated;
revoke execute on function private.require_handle(uuid) from public, anon, authenticated;
revoke execute on function private.comments_require_handle() from public, anon, authenticated;
revoke execute on function private.require_handle_of_user_id() from public, anon, authenticated;
revoke execute on function private.tracks_require_handle() from public, anon, authenticated;
revoke execute on function private.track_versions_require_handle() from public, anon, authenticated;
