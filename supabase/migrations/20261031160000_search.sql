-- Search over track titles, tags, handles and display names.
--
-- search(p_query, p_limit) returns live tracks and profiles of people who
-- are not banned, best match first. The query is trimmed, must be 3 to 100
-- characters, and at most 50 results come back (SEARCH_* in
-- src/config/limits.ts). Shorter queries match nearly everything and cost
-- too much, so they return nothing, and a search gets at most half a second.
-- It runs with the caller's rights, so RLS on tracks and profiles applies
-- on top of the filters here. Matching uses trigram word similarity, so a typo
-- or part of a word still finds something, with GIN indexes so it stays
-- fast as the feed grows.

create extension if not exists pg_trgm with schema extensions;

-- Tags as one string, for the index and the query (array_to_string is not
-- immutable, so it cannot be indexed directly). In public, because an index
-- expression runs as whoever writes the row.
-- Fully qualified instead of a search_path setting, so it can be inlined.
create function public.tags_text(p_tags text[])
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(pg_catalog.array_to_string(p_tags, ' '), '');
$$;

create index tracks_title_trgm_idx on public.tracks
  using gin (lower(title) extensions.gin_trgm_ops) where status = 'live';
create index tracks_tags_trgm_idx on public.tracks
  using gin (public.tags_text(tags) extensions.gin_trgm_ops) where status = 'live';
create index profiles_handle_trgm_idx on public.profiles
  using gin (handle extensions.gin_trgm_ops);
create index profiles_display_name_trgm_idx on public.profiles
  using gin (lower(display_name) extensions.gin_trgm_ops);

create function public.search(p_query text, p_limit integer default 20)
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
  select r.kind, r.id, r.slug, r.title, r.handle, r.display_name, r.rank
  from ((
    select 'track'::text as kind, t.id, t.slug, t.title, p.handle, p.display_name,
      greatest(
        extensions.word_similarity(q, lower(t.title)),
        extensions.word_similarity(q, public.tags_text(t.tags))
      ) as rank
    from public.tracks t
    join public.profiles p on p.id = t.owner_id
    where t.status = 'live'
      and p.banned_at is null
      and (
        q operator(extensions.<%) lower(t.title)
        or q operator(extensions.<%) public.tags_text(t.tags)
      )
    order by 7 desc, t.published_at desc
    limit n
  )
  union all
  (
    select 'profile'::text as kind, p.id, null::text, null::text, p.handle, p.display_name,
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
    order by 7 desc, p.handle
    limit n
  )) r
  order by r.rank desc, r.kind desc
  limit n;
end;
$$;

grant execute on function public.tags_text(text[]) to anon, authenticated, service_role;
revoke execute on function public.search(text, integer) from public;
grant execute on function public.search(text, integer) to anon, authenticated;
