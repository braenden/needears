import Link from "next/link";
import { ChevronRightIcon, UsersIcon } from "lucide-react";

import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/empty-state";
import { ReputationBadge } from "@/components/reputation-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { membersBy } from "@/components/groups/copy";
import { cn } from "@/lib/utils";
import type { ProfileSummary } from "@/types/view";
import { type PlayableTrack, TrackList } from "@/components/track/track-list";

import { SEARCH_MIN_LENGTH } from "@/config/limits";

export type TrackHit = PlayableTrack;

export type GroupHit = {
  id: string;
  slug: string;
  name: string;
  members_count: number;
  owner_name: string;
};

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
 * The search page body: groups first (a group's name is what someone looks
 * for when they were told it), then tracks and people, with the matching
 * part of each name marked. Handles too-short queries, loading, errors and
 * no results. Before anything is searched for it shows nothing.
 */
export function SearchResults({
  query,
  groups = [],
  tracks,
  profiles,
  status = "ready",
  className,
}: {
  query: string;
  groups?: GroupHit[];
  tracks: TrackHit[];
  profiles: ProfileSummary[];
  status?: "loading" | "ready" | "error";
  className?: string;
}) {
  const q = query.trim();
  const headingClass = "text-sm font-semibold";

  // Nothing searched for yet: the field is the whole page.
  if (!q) return null;
  if (q.length < SEARCH_MIN_LENGTH) {
    return (
      <p className={cn("text-center text-sm text-muted-foreground", className)}>
        Type at least {SEARCH_MIN_LENGTH} characters to search tracks and
        people.
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
  if (groups.length === 0 && tracks.length === 0 && profiles.length === 0) {
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
        {tracks.length} {tracks.length === 1 ? "track" : "tracks"},{" "}
        {profiles.length} {profiles.length === 1 ? "person" : "people"} and{" "}
        {groups.length} {groups.length === 1 ? "group" : "groups"} found.
      </p>
      {groups.length > 0 ? (
        <div>
          <h2 className={headingClass}>
            Groups{" "}
            <span className="font-normal text-muted-foreground">
              {groups.length}
            </span>
          </h2>
          <ul className="mt-2 grid gap-1 @md:grid-cols-2">
            {groups.map((group) => (
              <li key={group.id} className="min-w-0">
                <Link
                  href={`/g/${group.slug}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 focus-ring outline-none hover:bg-accent"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <UsersIcon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      <Highlight text={group.name} query={q} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {membersBy(group.members_count, group.owner_name)}
                    </span>
                  </span>
                  <ChevronRightIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tracks.length > 0 ? (
        <div>
          <h2 className={headingClass}>
            Tracks{" "}
            <span className="font-normal text-muted-foreground">
              {tracks.length}
            </span>
          </h2>
          {/* The same rows as the feed: they play where they are. */}
          <TrackList tracks={tracks} label="Tracks" className="mt-1" />
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
          <ul className="mt-2 grid gap-1 @md:grid-cols-2">
            {profiles.map((profile) => (
              <li key={profile.id} className="min-w-0">
                <Link
                  href={`/u/${profile.handle}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 focus-ring outline-none hover:bg-accent"
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
