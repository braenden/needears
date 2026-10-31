import { cn } from "@/lib/utils";

import { HostIcon, hostName, hostOf, type ProfileLink } from "./link-hosts";

/** Links on a profile, one per line on phones and in a row when there is room. */
export function ProfileLinks({
  links,
  className,
}: {
  links: ProfileLink[];
  className?: string;
}) {
  if (links.length === 0) return null;
  return (
    <ul
      aria-label="Links"
      className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm", className)}
    >
      {links.map((link) => {
        const host = hostOf(link.url);
        const label = link.label.trim() || (host ? hostName(host) : link.url);
        return (
          <li key={link.url} className="min-w-0">
            <a
              href={link.url}
              target="_blank"
              rel="me noopener noreferrer nofollow ugc"
              className="inline-flex max-w-full items-center gap-1.5 rounded-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HostIcon host={host} className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
