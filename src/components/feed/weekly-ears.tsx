"use client";

import { useId } from "react";
import Link from "next/link";

import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import type { ProfileSummary } from "@/types/view";

export type WeeklyLeader = {
  profile: ProfileSummary;
  /** Helpful marks received this week (Monday to Sunday). */
  helpful: number;
  /** 1 to 10. Ties share a rank. */
  rank: number;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** "Resets in 2 days" / "in 5 hours" / "in 12 minutes". Null on the server. */
export function resetText(resetsAt: string, now: number | null) {
  if (now === null) return "Resets every Monday";
  const left = new Date(resetsAt).getTime() - now;
  if (left <= 0) return "Resetting now";
  if (left >= DAY) {
    const days = Math.floor(left / DAY);
    const hours = Math.floor((left % DAY) / HOUR);
    return `Resets in ${days} ${days === 1 ? "day" : "days"}${hours ? `, ${hours} ${hours === 1 ? "hour" : "hours"}` : ""}`;
  }
  if (left >= HOUR) {
    const hours = Math.floor(left / HOUR);
    return `Resets in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const minutes = Math.max(1, Math.floor(left / 60_000));
  return `Resets in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * "Most helpful ears this week": the top ten by Helpful marks received this
 * week, with a countdown to Monday when it starts over. A narrow list in the
 * feed's side column on desktop (`variant="sidebar"`), a scrolling row under
 * the tabs on phones (`variant="row"`). Not a landmark on its own: put the
 * sidebar version in an <aside>.
 */
export function WeeklyEars({
  leaders,
  resetsAt,
  variant = "sidebar",
  loading = false,
  className,
}: {
  leaders: WeeklyLeader[];
  /** When the week ends: next Monday 00:00 Europe/Oslo, as ISO. */
  resetsAt: string;
  variant?: "sidebar" | "row";
  loading?: boolean;
  className?: string;
}) {
  const now = useNow();
  const top = leaders.slice(0, 10);
  const headingId = useId();
  const countdown = (
    <p className="text-xs text-muted-foreground" data-numeric>
      {resetText(resetsAt, now)}
    </p>
  );

  if (variant === "row") {
    return (
      <div className={cn("grid gap-2", className)}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={headingId} className="text-sm font-semibold">
            Most helpful ears this week
          </h2>
          {countdown}
        </div>
        {loading ? (
          <div className="flex gap-2" role="status" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-32 shrink-0 rounded-full" />
            ))}
          </div>
        ) : top.length === 0 ? (
          <EmptyText />
        ) : (
          <ol
            className="relative -mx-4 flex snap-x [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1"
            aria-labelledby={headingId}
          >
            {top.map((leader) => (
              <li key={leader.profile.id} className="shrink-0 snap-start">
                <Link
                  href={`/u/${leader.profile.handle}`}
                  className="flex h-10 items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Rank rank={leader.rank} />
                  <UserAvatar profile={leader.profile} size="sm" />
                  <span className="max-w-28 truncate font-medium">
                    {displayNameOf(leader.profile)}
                  </span>
                  <span className="text-xs text-muted-foreground" data-numeric>
                    {leader.helpful}
                    <span className="sr-only"> Helpful</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <h2 id={headingId} className="text-sm font-semibold">
        Most helpful ears this week
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Helpful marks received since Monday.
      </p>
      {loading ? (
        <div className="mt-3 grid gap-2.5" role="status" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <EmptyText className="mt-3" />
      ) : (
        <ol
          className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1"
          aria-labelledby={headingId}
        >
          {top.map((leader) => (
            <li key={leader.profile.id} className="min-w-0">
              <Link
                href={`/u/${leader.profile.handle}`}
                className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Rank rank={leader.rank} />
                <UserAvatar profile={leader.profile} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  {displayNameOf(leader.profile)}
                </span>
                <span
                  className="shrink-0 text-xs text-muted-foreground"
                  data-numeric
                >
                  {leader.helpful}
                  <span className="sr-only"> Helpful</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 border-t pt-3">{countdown}</div>
    </div>
  );
}

function Rank({ rank }: { rank: number }) {
  return (
    <span
      data-numeric
      className={cn(
        "w-4 shrink-0 text-center text-xs font-semibold",
        rank === 1 ? "text-gold" : "text-muted-foreground",
      )}
    >
      {rank}
      <span className="sr-only">.</span>
    </span>
  );
}

function EmptyText({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      Nobody has been marked Helpful yet this week. A good comment today puts
      you here.
    </p>
  );
}
