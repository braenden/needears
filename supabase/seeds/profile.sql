-- Generated from src/config/profile.ts by `pnpm db:config`. Do not edit.
delete from public.link_hosts where host not in ('soundcloud.com', 'bandcamp.com', 'spotify.com', 'music.apple.com', 'youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'facebook.com', 'threads.net', 'bsky.app', 'mixcloud.com', 'audiomack.com', 'beatport.com', 'tidal.com', 'deezer.com', 'twitch.tv', 'patreon.com');
insert into public.link_hosts (host)
values
  ('soundcloud.com'),
  ('bandcamp.com'),
  ('spotify.com'),
  ('music.apple.com'),
  ('youtube.com'),
  ('youtu.be'),
  ('instagram.com'),
  ('tiktok.com'),
  ('x.com'),
  ('twitter.com'),
  ('facebook.com'),
  ('threads.net'),
  ('bsky.app'),
  ('mixcloud.com'),
  ('audiomack.com'),
  ('beatport.com'),
  ('tidal.com'),
  ('deezer.com'),
  ('twitch.tv'),
  ('patreon.com')
on conflict (host) do nothing;
