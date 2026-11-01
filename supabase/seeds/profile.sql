-- Generated from src/config/profile.ts by `pnpm db:config`. Do not edit.
delete from public.link_hosts where host not in ('soundcloud.com', 'bandcamp.com', 'spotify.com', 'music.apple.com', 'youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'facebook.com', 'threads.com', 'threads.net', 'bsky.app', 'mixcloud.com', 'audiomack.com', 'beatport.com', 'tidal.com', 'deezer.com', 'twitch.tv', 'patreon.com');
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
