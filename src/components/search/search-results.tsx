import Link from "next/link";
import { MessageSquareIcon } from "lucide-react";

import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/empty-state";
import { ReputationBadge } from "@/components/reputation-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ProfileSummary, TrackSummary } from "@/types/view";

import { SEARCH_MIN_LENGTH } from "@/config/limits";

export type TrackHit = Pick<
  TrackSummary,
  "id" | "slug" | "title" | "duration_ms" | "comment_count" | "genre" | "owner"
>;

/** Splits text around case-insensitive matches of the query, for <mark>. */
export function highlightParts(text: string, query: string) {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (
    let at = lower.indexOf(needle);
    at !== -1;
    at = lower.indexOf(needle, from)
  ) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, i) =>
        part.match ? (
          <mark
            key={i}
            className="rounded-xs bg-primary-soft text-primary-text"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * The search page body: tracks and people in two groups, with the matching
 * part of each name marked. Handles too-short queries, loading, errors and
 * no results.
 */
export function SearchResults({
  query,
  tracks,
  profiles,
  status = "ready",
  className,
}: {
  query: string;
  tracks: TrackHit[];
  profiles: ProfileSummary[];
  status?: "loading" | "ready" | "error";
  className?: string;
}) {
  const q = query.trim();
  const headingClass = "text-sm font-semibold";

  if (q.length < SEARCH_MIN_LENGTH) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {q
          ? `Type at least ${SEARCH_MIN_LENGTH} characters to search tracks and people.`
          : `Type at least ${SEARCH_MIN_LENGTH} characters and press Enter to search tracks and people.`}
      </p>
    );
  }
  if (status === "loading") {
    return (
      <div
        className={cn("grid gap-3", className)}
        role="status"
        aria-label="Searching"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (status === "error") {
    return (
      <EmptyState
        className={className}
        title="Something broke on our side."
        body="Try again, or come back in a minute."
      />
    );
  }
  if (tracks.length === 0 && profiles.length === 0) {
    return (
      <EmptyState
        className={className}
        title={`Nothing found for "${q}".`}
        body="Check the spelling, or try a shorter word."
      />
    );
  }

  return (
    <div className={cn("@container grid gap-8", className)}>
      <p className="sr-only" role="status">
        {tracks.length} {tracks.length === 1 ? "track" : "tracks"} and{" "}
        {profiles.length} {profiles.length === 1 ? "person" : "people"} found.
      </p>
      {tracks.length > 0 ? (
        <div>
          <h2 className={headingClass}>
            Tracks{" "}
            <span className="font-normal text-muted-foreground">
              {tracks.length}
            </span>
          </h2>
          <ul className="mt-2 divide-y rounded-xl border bg-card">
            {tracks.map((track) => (
              <li key={track.id}>
                <Link
                  href={`/t/${track.slug}`}
                  className="flex items-center gap-3 px-3 py-3 outline-none first:rounded-t-xl last:rounded-b-xl hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @sm:px-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      <Highlight text={track.title} query={q} />
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted-foreground">
                      <span className="truncate">
                        {displayNameOf(track.owner)}
                      </span>
                      <span>{track.genre.name}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1" data-numeric>
                      <MessageSquareIcon
                        className="size-3.5"
                        aria-hidden="true"
                      />
                      {track.comment_count}
                      <span className="sr-only">
                        {track.comment_count === 1 ? " comment" : " comments"}
                      </span>
                    </span>
                    <time data-numeric className="hidden @sm:inline">
                      {formatTime(track.duration_ms)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {profiles.length > 0 ? (
        <div>
          <h2 className={headingClass}>
            People{" "}
            <span className="font-normal text-muted-foreground">
              {profiles.length}
            </span>
          </h2>
          <ul className="mt-2 grid gap-2 @md:grid-cols-2">
            {profiles.map((profile) => (
              <li key={profile.id} className="min-w-0">
                <Link
                  href={`/u/${profile.handle}`}
                  className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserAvatar profile={profile} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      <Highlight text={displayNameOf(profile)} query={q} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @<Highlight text={profile.handle} query={q} />
                    </span>
                  </span>
                  <ReputationBadge
                    helpful={profile.reputation}
                    withTooltip={false}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
