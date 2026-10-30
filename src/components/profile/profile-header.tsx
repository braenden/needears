import { PencilIcon } from "lucide-react";

import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { ReputationBadge } from "@/components/reputation-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { reputationFor } from "@/config/reputation";
import { cn } from "@/lib/utils";
import type { Profile, ProfileStats } from "@/types/view";

const memberSince = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function ProfileHeader({
  profile,
  stats,
  isOwn = false,
  onEdit,
  headingLevel = 1,
  className,
}: {
  profile: Profile;
  stats: ProfileStats;
  isOwn?: boolean;
  onEdit?: () => void;
  /** 1 on the profile page. Lower when shown inside another page. */
  headingLevel?: 1 | 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  const name = displayNameOf(profile);
  const rep = reputationFor(stats.helpfulReceived);
  const toNext = rep.next ? rep.next.minHelpful - stats.helpfulReceived : 0;

  return (
    <header className={cn("@container", className)}>
      <div className="flex flex-col gap-4 @md:flex-row @md:items-end">
        <UserAvatar
          profile={profile}
          size="xl"
          className="ring-4 ring-background"
        />
        <div className="min-w-0 flex-1">
          <Heading className="font-display text-3xl leading-[1.05] font-bold tracking-tight break-words @md:text-4xl">
            {name}
          </Heading>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            <span className="break-all">@{profile.handle}</span>
            <ReputationBadge helpful={stats.helpfulReceived} showNew={isOwn} />
            <span>
              Member since{" "}
              <time dateTime={profile.created_at}>
                {memberSince.format(new Date(profile.created_at))}
              </time>
            </span>
          </div>
        </div>
        {isOwn ? (
          <Button
            variant="outline"
            onClick={onEdit}
            className="self-start @md:self-end"
          >
            <PencilIcon /> Edit profile
          </Button>
        ) : null}
      </div>

      {profile.bio ? (
        <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-pretty break-words">
          {profile.bio}
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
        {(
          [
            ["Tracks", stats.tracks],
            ["Comments given", stats.commentsGiven],
            ["Helpful received", stats.helpfulReceived],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col-reverse gap-0.5 bg-card px-3 py-3 @sm:px-4"
          >
            <dt className="text-xs leading-tight text-muted-foreground">
              {label}
            </dt>
            <dd data-numeric className="text-xl font-semibold @sm:text-2xl">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {isOwn ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {rep.next
            ? `${toNext} more Helpful ${toNext === 1 ? "mark" : "marks"} to reach ${rep.next.name}.`
            : "You're a Golden ear. Thank you."}
        </p>
      ) : null}
    </header>
  );
}

export function ProfileHeaderSkeleton() {
  return (
    <div role="status" aria-label="Loading profile">
      <div className="flex items-end gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </div>
      <Skeleton className="mt-4 h-4 w-full max-w-prose" />
      <Skeleton className="mt-5 h-20 w-full rounded-xl" />
    </div>
  );
}
