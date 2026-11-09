import { BadgeList } from "@/components/profile/badges";
import {
  type ProfileStatsV2,
  ProfileStatsBlock,
} from "@/components/profile/profile-stats";
import { reputationFor } from "@/config/reputation";
import type { EarnedBadge } from "@/components/profile/badges";

const hereSince = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Everything about a person that is not their music: how they give
 * feedback (the numbers and the badges), their level, what they are
 * working on and in which program, and since when they are here.
 */
export function ProfileAbout({
  stats,
  badges,
  helpfulReceived,
  isOwn,
  workingOn,
  daw,
  createdAt,
}: {
  stats: ProfileStatsV2;
  badges: EarnedBadge[];
  helpfulReceived: number;
  isOwn: boolean;
  workingOn: string | null;
  daw: string | null;
  createdAt: string;
}) {
  const rep = reputationFor(helpfulReceived);
  const toNext = rep.next ? rep.next.minHelpful - helpfulReceived : 0;
  return (
    <div className="grid max-w-2xl gap-6 py-6 text-[15px]">
      <ProfileStatsBlock stats={stats} />
      <BadgeList badges={badges} showLocked={isOwn} />
      <p className="text-muted-foreground">
        <span className="text-foreground">{rep.name}</span>
        {isOwn
          ? rep.next
            ? `. ${toNext} more Helpful ${toNext === 1 ? "mark" : "marks"} to reach ${rep.next.name}.`
            : ". Thank you."
          : null}
      </p>
      {workingOn ? (
        <p className="break-words text-muted-foreground">
          Working on <span className="text-foreground">{workingOn}</span>
        </p>
      ) : null}
      <p className="break-words text-muted-foreground">
        {daw ? (
          <>
            Makes music in <span className="text-foreground">{daw}</span>.{" "}
          </>
        ) : null}
        Here since{" "}
        <time dateTime={createdAt}>
          {hereSince.format(new Date(createdAt))}
        </time>
        .
      </p>
    </div>
  );
}
