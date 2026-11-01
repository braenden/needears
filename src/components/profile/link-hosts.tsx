import { LinkIcon } from "lucide-react";
import {
  isAllowedLinkUrl,
  linkHostFor,
  linkHosts,
  linkServiceNames,
} from "@/config/profile";

/** Hosts a profile can link to, from src/config/profile.ts. */
export const LINK_HOSTS = linkHosts;

/** Each service once, for "Links can go to ...". */
export const LINK_SERVICE_NAMES = linkServiceNames;

export type LinkHost = (typeof LINK_HOSTS)[number]["host"];

export const LINKS_MAX = 5;
export const LINK_LABEL_MAX = 40;

export type ProfileLink = { label: string; url: string };

/** The allowed host a URL belongs to, by the rules in src/config/profile.ts. */
export function hostOf(url: string): LinkHost | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return linkHostFor(parsed.hostname)?.host ?? null;
}

export function hostName(host: LinkHost) {
  return LINK_HOSTS.find((h) => h.host === host)?.name ?? host;
}

/** Null when the link is fine, otherwise the message to show next to it. */
export function linkError(link: ProfileLink): string | null {
  const url = link.url.trim();
  if (!url) return "Add a link.";
  if (!/^https:\/\//i.test(url)) return "Links start with https://.";
  if (!hostOf(url) || !isAllowedLinkUrl(url)) {
    return `Links can go to ${LINK_SERVICE_NAMES.join(", ")}.`;
  }
  if (link.label.length > LINK_LABEL_MAX) {
    return `Labels can be up to ${LINK_LABEL_MAX} characters.`;
  }
  return null;
}

/**
 * Small monoline marks per host. Simple shapes that hint at the service,
 * not the services' own logos.
 */
export function HostIcon({
  host,
  className = "size-4",
}: {
  host: LinkHost | null;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
  switch (host) {
    case "soundcloud.com":
      return (
        <svg {...common}>
          <path d="M5 12h7.5a2.5 2.5 0 0 0 .2-5A4 4 0 0 0 5 6.2" />
          <path d="M2 12V9M3.5 12V7.5" />
        </svg>
      );
    case "bandcamp.com":
      return (
        <svg {...common}>
          <path d="M5 4.5h9l-3 7H2z" />
        </svg>
      );
    case "instagram.com":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="3.2" />
          <circle cx="8" cy="8" r="2.5" />
          <circle cx="11.4" cy="4.6" r="0.4" fill="currentColor" />
        </svg>
      );
    case "youtube.com":
    case "youtu.be":
      return (
        <svg {...common}>
          <rect x="1.5" y="3.5" width="13" height="9" rx="2.5" />
          <path d="m6.8 6 3 2-3 2z" fill="currentColor" />
        </svg>
      );
    case "spotify.com":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M5 6.6c2-.6 4.2-.4 6 .6M5.5 8.6c1.6-.4 3.2-.2 4.6.5M6 10.5c1.1-.3 2.2-.1 3.2.4" />
        </svg>
      );
    case "tiktok.com":
      return (
        <svg {...common}>
          <path d="M9 2.5v7.8a2.3 2.3 0 1 1-2.3-2.3" />
          <path d="M9 2.5c.3 1.7 1.6 3 3.5 3.2" />
        </svg>
      );
    case "x.com":
    case "twitter.com":
      return (
        <svg {...common}>
          <path d="M3 3l10 10M13 3 3 13" />
        </svg>
      );
    default:
      return <LinkIcon aria-hidden="true" className={className} />;
  }
}
