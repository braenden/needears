-- More services for profile links and reference tracks: X, Apple Music,
-- Facebook, Threads, Bluesky, Mixcloud, Audiomack, Beatport, Tidal, Deezer,
-- Twitch and Patreon, and YouTube's short links. The list lives in
-- src/config/profile.ts; this adds the new rows so a database push is
-- enough (supabase/seeds/profile.sql writes the same list).

insert into public.link_hosts (host)
values
  ('music.apple.com'), ('youtu.be'), ('x.com'), ('twitter.com'), ('facebook.com'),
  ('threads.net'), ('bsky.app'), ('mixcloud.com'), ('audiomack.com'), ('beatport.com'),
  ('tidal.com'), ('deezer.com'), ('twitch.tv'), ('patreon.com')
on conflict (host) do nothing;
