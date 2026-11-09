import { Fragment } from "react";

import { cn } from "@/lib/utils";

import { hostName, hostOf, type ProfileLink } from "./link-hosts";

/** Links on a profile, on one grey line. */
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
      className={cn(
        "flex flex-wrap gap-x-1.5 text-[13px] text-muted-foreground",
        className,
      )}
    >
      {links.map((link, i) => {
        const host = hostOf(link.url);
        // Always the service's name, so the text can never name one place
        // while the link goes to another.
        const label = host ? hostName(host) : link.url;
        return (
          <Fragment key={link.url}>
            {i > 0 ? (
              <li aria-hidden="true" className="select-none">
                ·
              </li>
            ) : null}
            <li className="min-w-0">
              <a
                href={link.url}
                target="_blank"
                rel="me noopener noreferrer nofollow ugc"
                className="inline-block max-w-full truncate rounded-xs align-bottom focus-ring outline-none hover:text-foreground hover:underline hover:underline-offset-4"
              >
                {label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
