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

// The services a profile link or a reference track may point to. A link
// may use the host itself, www. or m. in front of it, and the subdomains
// listed for that host (or any subdomain where `anySubdomain` is set, for
// artist pages like nora.bandcamp.com). Other subdomains are refused, since
// services keep redirect and sign in pages there (l.facebook.com,
// id.twitch.tv). The names are what the forms show.
type LinkHostRule = {
  host: string;
  name: string;
  subdomains?: readonly string[];
  anySubdomain?: boolean;
};

export const linkHosts = [
  { host: "soundcloud.com", name: "SoundCloud", subdomains: ["on"] },
  { host: "bandcamp.com", name: "Bandcamp", anySubdomain: true },
  { host: "spotify.com", name: "Spotify", subdomains: ["open"] },
  { host: "music.apple.com", name: "Apple Music" },
  { host: "youtube.com", name: "YouTube", subdomains: ["music"] },
  { host: "youtu.be", name: "YouTube" },
  { host: "instagram.com", name: "Instagram" },
  { host: "tiktok.com", name: "TikTok", subdomains: ["vm"] },
  { host: "x.com", name: "X", subdomains: ["mobile"] },
  { host: "twitter.com", name: "X", subdomains: ["mobile"] },
  { host: "facebook.com", name: "Facebook" },
  { host: "threads.com", name: "Threads" },
  { host: "threads.net", name: "Threads" },
  { host: "bsky.app", name: "Bluesky" },
  { host: "mixcloud.com", name: "Mixcloud" },
  { host: "audiomack.com", name: "Audiomack" },
  { host: "beatport.com", name: "Beatport" },
  { host: "tidal.com", name: "Tidal", subdomains: ["listen"] },
  { host: "deezer.com", name: "Deezer" },
  { host: "twitch.tv", name: "Twitch" },
  { host: "patreon.com", name: "Patreon" },
] as const satisfies readonly LinkHostRule[];

export type LinkHostName = (typeof linkHosts)[number]["host"];

// Subdomains every host allows.
const COMMON_SUBDOMAINS = ["www", "m"];

// Every subdomain a host allows, as the database stores it.
export function allowedSubdomains(rule: LinkHostRule): string[] {
  return [...COMMON_SUBDOMAINS, ...(rule.subdomains ?? [])];
}

// Paths that sign in or bounce the visitor somewhere else. Refused on every
// host. Kept equal to the pattern in private.link_url_allowed.
export const BLOCKED_LINK_PATHS =
  /^\/(oauth|dialog\/|l\.php|i\/redirect|redirect)/i;

export const profileLinkHosts = linkHosts.map((h) => h.host);

// Each service once, in the order above, for "Links can go to ...".
export const linkServiceNames = [...new Set(linkHosts.map((h) => h.name))];

// The rule a host name matches, or null.
export function linkHostFor(
  hostname: string,
): (typeof linkHosts)[number] | null {
  const name = hostname.toLowerCase();
  for (const rule of linkHosts) {
    if (name === rule.host) return rule;
    if (!name.endsWith(`.${rule.host}`)) continue;
    const sub = name.slice(0, -rule.host.length - 1);
    if ("anySubdomain" in rule && rule.anySubdomain) {
      if (/^[a-z0-9-]+$/.test(sub)) return rule;
    } else if (allowedSubdomains(rule).includes(sub)) {
      return rule;
    }
  }
  return null;
}

// Control characters and text direction marks, which can disguise a link.
// The database rejects the same ones in labels and URLs.
export const UNSAFE_CHARS =
  /[\u0001-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

// Same rule as the database (private.link_url_allowed): https, a lower case
// host made of non empty labels, no port or user info, an allowed host and
// subdomain, and no redirect or sign in path.
export function isAllowedLinkUrl(value: string): boolean {
  if (value.length > LINK_URL_MAX || UNSAFE_CHARS.test(value)) return false;
  const match = /^https:\/\/((?:[a-z0-9-]+\.)+[a-z0-9-]+)(\/\S*)?$/.exec(value);
  if (!match) return false;
  if (BLOCKED_LINK_PATHS.test(match[2] ?? "")) return false;
  return linkHostFor(match[1]!) !== null;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// The SQL written to supabase/seeds/profile.sql. Idempotent.
export function profileSeedSql(): string {
  const hosts = linkHosts.map((h) => sqlString(h.host));
  const rows = linkHosts.map((h) => {
    const any = "anySubdomain" in h && h.anySubdomain === true;
    const subs = allowedSubdomains(h).map(sqlString).join(", ");
    return `  (${sqlString(h.host)}, array[${subs}]::text[], ${any})`;
  });
  return [
    "-- Generated from src/config/profile.ts by `pnpm db:config`. Do not edit.",
    `delete from public.link_hosts where host not in (${hosts.join(", ")});`,
    "insert into public.link_hosts (host, subdomains, any_subdomain)",
    "values",
    rows.join(",\n"),
    "on conflict (host) do update set",
    "  subdomains = excluded.subdomains,",
    "  any_subdomain = excluded.any_subdomain;",
    "",
  ].join("\n");
}
