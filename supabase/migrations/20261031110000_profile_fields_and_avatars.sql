-- Profile fields and uploaded profile pictures.
--
-- profiles.links: up to five {label, url} pairs. Only https URLs on the
-- hosts in `link_hosts` (or their subdomains), no port or user info.
-- profiles.working_on: one line about what someone is making right now.
-- profiles.daw: the DAW or setup they use, free text.
--
-- profiles.avatar_key: a picture uploaded to the private `avatars` bucket.
-- It wins over avatar_url (the Google picture) when both are set. Only
-- POST /api/profile/avatar sets it (no update grant), after checking the
-- file's size, type and first bytes, because Storage's copy endpoint skips
-- the bucket limits. Files are read through signed URLs, and only files
-- that are someone's current avatar can be read. People upload to their own folder, keep at most
-- three files there, and can delete the ones they no longer use. Unused
-- files older than three hours are removed by the daily cleanup.
--
-- The limits mirror src/config/profile.ts.

-- Link hosts -----------------------------------------------------------------
-- Generated from src/config/profile.ts (supabase/seeds/profile.sql). The
-- rows below are the defaults, so the check works before the seed runs.

create table public.link_hosts (
  host text primary key check (host ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$')
);

comment on table public.link_hosts is
  'Generated from src/config/profile.ts. Do not edit by hand.';

insert into public.link_hosts (host)
values ('bandcamp.com'), ('instagram.com'), ('soundcloud.com'), ('spotify.com'),
  ('tiktok.com'), ('youtube.com');

alter table public.link_hosts enable row level security;
revoke all on public.link_hosts from anon, authenticated;
grant select on public.link_hosts to anon, authenticated;
create policy "Link hosts are public" on public.link_hosts
  for select to anon, authenticated using (true);

create function private.link_url_allowed(p_url text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host text;
begin
  if p_url is null
    or char_length(p_url) > 300
    or p_url !~ '^https://[a-z0-9.-]+(/\S*)?$'
    or p_url ~ '[\u0001-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]'
  then
    return false;
  end if;
  v_host := lower(substring(p_url from '^https://([^/]+)'));
  return exists (
    select 1 from public.link_hosts h
    where v_host = h.host or right(v_host, char_length(h.host) + 1) = '.' || h.host
  );
end;
$$;

-- Trims the labels and checks every link. Raises invalid_link.
create function private.normalize_links(p_links jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  item jsonb;
  label text;
  url text;
  result jsonb := '[]'::jsonb;
begin
  if p_links is null or jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 5 then
    raise exception 'invalid_link' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_links) loop
    if jsonb_typeof(item) <> 'object'
      or (select count(*) from jsonb_object_keys(item)) <> 2
      or jsonb_typeof(item -> 'label') is distinct from 'string'
      or jsonb_typeof(item -> 'url') is distinct from 'string'
    then
      raise exception 'invalid_link' using errcode = '22023';
    end if;

    label := btrim(item ->> 'label');
    url := btrim(item ->> 'url');
    if char_length(label) not between 1 and 40
      or label ~ '[\u0001-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]'
      or not private.link_url_allowed(url)
    then
      raise exception 'invalid_link' using errcode = '22023';
    end if;

    result := result || jsonb_build_array(jsonb_build_object('label', label, 'url', url));
  end loop;

  return result;
end;
$$;

-- Columns --------------------------------------------------------------------

alter table public.profiles
  add column links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  add column working_on text not null default '' check (char_length(working_on) <= 120),
  add column daw text not null default '' check (char_length(daw) <= 40),
  add column avatar_key text;

alter table public.profiles add constraint profiles_avatar_key_format check (
  avatar_key ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$'
  and split_part(avatar_key, '/', 1) = id::text
);

create index profiles_avatar_key_idx on public.profiles (avatar_key) where avatar_key is not null;

grant update (links, working_on, daw) on public.profiles to authenticated;

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

  -- A banned person cannot change what others see on their profile.
  if tg_op = 'UPDATE'
    and old.banned_at is not null
    and coalesce((select auth.jwt()) ->> 'role', '') = 'authenticated'
    and (new.links, new.working_on, new.daw, new.avatar_key)
      is distinct from (old.links, old.working_on, old.daw, old.avatar_key)
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

-- Avatars bucket -------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Used by the insert policy: the name is `<caller>/<uuid>.jpg|webp`, the
-- caller is not banned and has fewer than three files in the bucket.
create function public.can_upload_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$'
    )
    and not exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and banned_at is not null
    )
    and (
      select count(*) from storage.objects o
      where o.bucket_id = 'avatars' and o.owner_id = (select auth.uid())::text
    ) < 3;
$$;

revoke execute on function public.can_upload_avatar(text) from public, anon;
grant execute on function public.can_upload_avatar(text) to authenticated;

create policy "Users upload avatars to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.can_upload_avatar(name));

create policy "Current avatars are readable" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'avatars'
    and (metadata ->> 'size')::bigint <= 524288
    and metadata ->> 'mimetype' in ('image/jpeg', 'image/webp')
    and exists (select 1 from public.profiles p where p.avatar_key = objects.name)
  );

create policy "Users see their own avatar files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

-- Not the current one: clear avatar_key first, so no profile points at a
-- missing file.
create policy "Users delete their unused avatar files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid())::text
    and not exists (select 1 from public.profiles p where p.avatar_key = objects.name)
  );

-- Cleanup ----------------------------------------------------------------------
-- Avatar files nobody uses, older than three hours, join the upload files
-- the daily cleanup removes.

create or replace function public.orphaned_upload_objects(p_limit integer default 100)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.created_at < now() - interval '3 hours'
    and (
      (
        o.bucket_id in ('audio', 'peaks')
        and not exists (
          select 1 from public.tracks t
          where t.audio_key = o.name or t.peaks_key = o.name
        )
        and not exists (
          select 1 from private.upload_reservations r
          where r.expires_at > now()
            and o.name like r.user_id::text || '/' || r.object_id::text || '.%'
        )
      )
      or (
        o.bucket_id = 'avatars'
        and not exists (select 1 from public.profiles p where p.avatar_key = o.name)
      )
    )
  order by o.created_at
  limit least(greatest(p_limit, 1), 500);
$$;

revoke execute on function private.link_url_allowed(text) from public, anon, authenticated;
revoke execute on function private.normalize_links(jsonb) from public, anon, authenticated;
revoke execute on function public.orphaned_upload_objects(integer) from public, anon, authenticated;
grant execute on function public.orphaned_upload_objects(integer) to service_role;
