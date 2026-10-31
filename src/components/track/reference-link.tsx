import {
  HostIcon,
  hostName,
  hostOf,
  LINK_HOSTS,
} from "@/components/profile/link-hosts";
import { cn } from "@/lib/utils";

/** Null when the reference URL is fine, otherwise what to tell the uploader. */
export function referenceError(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  if (!/^https:\/\//i.test(value)) return "Links start with https://.";
  if (!hostOf(value)) {
    return `Reference tracks can link to ${LINK_HOSTS.map((h) => h.name).join(", ")}.`;
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
    <p className={cn("text-sm", className)}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HostIcon
          host={host}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span>
          Reference track{" "}
          <span className="text-muted-foreground">on {hostName(host)}</span>
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
