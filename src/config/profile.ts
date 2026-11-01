// Profile limits and the hosts profile links may point to. The hosts are
// written to the `link_hosts` table by `pnpm db:config`
// (supabase/seeds/profile.sql), so the database and the forms agree. A unit
// test fails if the SQL file is out of date.

export const LINKS_MAX = 5;
export const LINK_LABEL_MAX = 40;
export const LINK_URL_MAX = 300;
export const WORKING_ON_MAX = 120;
export const DAW_MAX = 40;

// Uploaded profile pictures: square, cropped in the browser.
export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/webp"] as const;
export const AVATAR_SIZE_PX = 512;
// Files a person can keep in the avatars bucket at once (the current picture
// plus a couple of uploads in progress). Old ones are deleted by the owner
// or by the daily cleanup.
export const AVATAR_FILES_MAX = 3;

// The services a profile link or a reference track may point to: one of
// these hosts or a subdomain of it. The names are what the forms show.
export const linkHosts = [
  { host: "soundcloud.com", name: "SoundCloud" },
  { host: "bandcamp.com", name: "Bandcamp" },
  { host: "spotify.com", name: "Spotify" },
  { host: "music.apple.com", name: "Apple Music" },
  { host: "youtube.com", name: "YouTube" },
  { host: "youtu.be", name: "YouTube" },
  { host: "instagram.com", name: "Instagram" },
  { host: "tiktok.com", name: "TikTok" },
  { host: "x.com", name: "X" },
  { host: "twitter.com", name: "X" },
  { host: "facebook.com", name: "Facebook" },
  { host: "threads.net", name: "Threads" },
  { host: "bsky.app", name: "Bluesky" },
  { host: "mixcloud.com", name: "Mixcloud" },
  { host: "audiomack.com", name: "Audiomack" },
  { host: "beatport.com", name: "Beatport" },
  { host: "tidal.com", name: "Tidal" },
  { host: "deezer.com", name: "Deezer" },
  { host: "twitch.tv", name: "Twitch" },
  { host: "patreon.com", name: "Patreon" },
] as const;

export const profileLinkHosts = linkHosts.map((h) => h.host);

// Each service once, in the order above, for "Links can go to ...".
export const linkServiceNames = [...new Set(linkHosts.map((h) => h.name))];

// Control characters and text direction marks, which can disguise a link.
// The database rejects the same ones in labels and URLs.
export const UNSAFE_CHARS =
  /[\u0001-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

// Same rule as the database (private.link_url_allowed): https, a lower case
// host, no port or user info, and an allowed host.
export function isAllowedLinkUrl(value: string): boolean {
  if (value.length > LINK_URL_MAX || UNSAFE_CHARS.test(value)) return false;
  const match = /^https:\/\/([a-z0-9.-]+)(\/\S*)?$/.exec(value);
  if (!match) return false;
  const host = match[1]!;
  return profileLinkHosts.some((h) => host === h || host.endsWith(`.${h}`));
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// The SQL written to supabase/seeds/profile.sql. Idempotent.
export function profileSeedSql(): string {
  const hosts = profileLinkHosts.map(sqlString);
  return [
    "-- Generated from src/config/profile.ts by `pnpm db:config`. Do not edit.",
    `delete from public.link_hosts where host not in (${hosts.join(", ")});`,
    "insert into public.link_hosts (host)",
    "values",
    hosts.map((h) => `  (${h})`).join(",\n"),
    "on conflict (host) do nothing;",
    "",
  ].join("\n");
}
