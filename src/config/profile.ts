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

// A link may point to one of these hosts or a subdomain of it.
export const profileLinkHosts = [
  "bandcamp.com",
  "instagram.com",
  "soundcloud.com",
  "spotify.com",
  "tiktok.com",
  "youtube.com",
] as const;

// Same rule as the database (private.link_url_allowed): https, no port or
// user info, and an allowed host.
export function isAllowedLinkUrl(value: string): boolean {
  if (value.length > LINK_URL_MAX) return false;
  const match = /^https:\/\/([a-z0-9.-]+)(\/\S*)?$/i.exec(value);
  if (!match) return false;
  const host = match[1]!.toLowerCase();
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
