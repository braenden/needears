-- Generated from src/config/profile.ts by `pnpm db:config`. Do not edit.
delete from public.link_hosts where host not in ('bandcamp.com', 'instagram.com', 'soundcloud.com', 'spotify.com', 'tiktok.com', 'youtube.com');
insert into public.link_hosts (host)
values
  ('bandcamp.com'),
  ('instagram.com'),
  ('soundcloud.com'),
  ('spotify.com'),
  ('tiktok.com'),
  ('youtube.com')
on conflict (host) do nothing;
