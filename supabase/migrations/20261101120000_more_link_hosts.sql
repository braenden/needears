-- Services for profile links and reference tracks, each with its own
-- subdomain rule.
--
-- New services: X, Apple Music, Facebook, Threads, Bluesky, Mixcloud,
-- Audiomack, Beatport, Tidal, Deezer, Twitch and Patreon, and YouTube's
-- short links.
--
-- A link used to be allowed on a host or any subdomain of it. Services keep
-- redirect and sign in pages on other subdomains (l.facebook.com,
-- id.twitch.tv), so now only the host itself, www., m. and the subdomains
-- listed for it count, or any subdomain where any_subdomain is set (artist
-- pages on Bandcamp). Path segments that sign in or bounce the visitor
-- elsewhere (oauth, oauth2, dialog, l.php, redirect) are refused anywhere in
-- the path on every host. So are back slashes, empty segments, . and ..
-- segments and percent encoded ASCII in the path, since browsers and
-- services normalize them and could land on a blocked path
-- (/foo/../oauth2, //oauth2, /%6fauth2). The host must be made of non empty
-- labels.
--
-- The list lives in src/config/profile.ts; the rows below are what
-- `pnpm db:config` writes to supabase/seeds/profile.sql, so a database push
-- is enough. Links saved before are not checked again until they change.

alter table public.link_hosts
  add column subdomains text[] not null default array['www', 'm']
    check (array_to_string(subdomains, ',') ~ '^([a-z0-9-]+(,[a-z0-9-]+)*)?$'),
  add column any_subdomain boolean not null default false;

insert into public.link_hosts (host, subdomains, any_subdomain)
values
  ('soundcloud.com', array['www', 'm', 'on']::text[], false),
  ('bandcamp.com', array['www', 'm']::text[], true),
  ('spotify.com', array['www', 'm', 'open']::text[], false),
  ('music.apple.com', array['www', 'm']::text[], false),
  ('youtube.com', array['www', 'm', 'music']::text[], false),
  ('youtu.be', array['www', 'm']::text[], false),
  ('instagram.com', array['www', 'm']::text[], false),
  ('tiktok.com', array['www', 'm', 'vm']::text[], false),
  ('x.com', array['www', 'm', 'mobile']::text[], false),
  ('twitter.com', array['www', 'm', 'mobile']::text[], false),
  ('facebook.com', array['www', 'm']::text[], false),
  ('threads.com', array['www', 'm']::text[], false),
  ('threads.net', array['www', 'm']::text[], false),
  ('bsky.app', array['www', 'm']::text[], false),
  ('mixcloud.com', array['www', 'm']::text[], false),
  ('audiomack.com', array['www', 'm']::text[], false),
  ('beatport.com', array['www', 'm']::text[], false),
  ('tidal.com', array['www', 'm', 'listen']::text[], false),
  ('deezer.com', array['www', 'm']::text[], false),
  ('twitch.tv', array['www', 'm']::text[], false),
  ('patreon.com', array['www', 'm']::text[], false)
on conflict (host) do update set
  subdomains = excluded.subdomains,
  any_subdomain = excluded.any_subdomain;

create or replace function private.link_url_allowed(p_url text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host text;
  v_path text;
begin
  if p_url is null
    or char_length(p_url) > 300
    or p_url !~ '^https://([a-z0-9-]+\.)+[a-z0-9-]+(/\S*)?$'
    or p_url ~ '[\u0001-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]'
  then
    return false;
  end if;

  v_host := substring(p_url from '^https://([^/]+)');
  -- The path before ? and #. Kept equal to isAllowedLinkPath in
  -- src/config/profile.ts.
  v_path := coalesce(substring(p_url from '^https://[^/]+(/[^?#]*)'), '');

  if strpos(v_path, '\') > 0
    or strpos(v_path, '//') > 0
    or v_path ~ '(^|/)\.\.?(/|$)'
    or v_path ~* '%[0-7][0-9a-f]'
    or v_path ~* '(^|/)(oauth2?|dialog|l\.php|redirect)(/|$)'
  then
    return false;
  end if;

  return exists (
    select 1 from public.link_hosts h
    where v_host = h.host
      or (
        right(v_host, char_length(h.host) + 1) = '.' || h.host
        and (
          left(v_host, char_length(v_host) - char_length(h.host) - 1) = any (h.subdomains)
          or (
            h.any_subdomain
            and left(v_host, char_length(v_host) - char_length(h.host) - 1) ~ '^[a-z0-9-]+$'
          )
        )
      )
  );
end;
$$;

revoke execute on function private.link_url_allowed(text) from public, anon, authenticated;
