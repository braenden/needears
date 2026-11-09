import {
  hostName,
  hostOf,
  LINK_SERVICE_NAMES,
} from "@/components/profile/link-hosts";
import { isAllowedLinkUrl } from "@/config/profile";
import { cn } from "@/lib/utils";

/** Null when the reference URL is fine, otherwise what to tell the uploader. */
export function referenceError(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  if (!/^https:\/\//i.test(value)) return "Links start with https://.";
  if (!hostOf(value) || !isAllowedLinkUrl(value)) {
    return `Reference tracks can link to ${LINK_SERVICE_NAMES.join(", ")}.`;
  }
  return null;
}

/**
 * The uploader's reference track, under the description: what they want
 * their mix to sound like. Opens in a new tab and passes no referrer.
 */
export function ReferenceLink({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const host = hostOf(url);
  if (!host) return null;
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      Reference:{" "}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="rounded-xs text-foreground underline underline-offset-4 focus-ring outline-none hover:decoration-2"
      >
        a track on {hostName(host)}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
