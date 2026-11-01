import {
  EarIcon,
  LockIcon,
  Music2Icon,
  SparklesIcon,
  StarIcon,
} from "lucide-react";

import { InfoTip } from "@/components/common/info-tip";
import { reputationLevels } from "@/config/reputation";
import { cn } from "@/lib/utils";

/** Mirrors the badge enum in the database. */
export type BadgeKind =
  "first_ears" | "finisher" | "ten_tracks_helped" | "golden_ear";

export type EarnedBadge = { badge: BadgeKind; awarded_at: string };

const goldenAt =
  reputationLevels.find((l) => l.id === "golden_ear")?.minHelpful ?? 60;

export const BADGES: Record<
  BadgeKind,
  { name: string; how: string; Icon: typeof EarIcon }
> = {
  first_ears: {
    name: "First ears",
    how: "Left the first comment on a track nobody else had commented on.",
    Icon: EarIcon,
  },
  finisher: {
    name: "Finisher",
    how: "Uploaded a new version of a track after getting feedback.",
    Icon: Music2Icon,
  },
  ten_tracks_helped: {
    name: "Ten tracks helped",
    how: "Had comments marked Helpful by ten different uploaders.",
    Icon: SparklesIcon,
  },
  golden_ear: {
    name: "Golden ear",
    how: `Was marked Helpful ${goldenAt} times.`,
    Icon: StarIcon,
  },
};

const ORDER: BadgeKind[] = [
  "first_ears",
  "finisher",
  "ten_tracks_helped",
  "golden_ear",
];

const earnedOn = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Badges as small chips. Hover or focus explains how each one is earned.
 * On your own profile the ones you do not have yet show as locked, so it is
 * clear what they are for.
 */
export function BadgeList({
  badges,
  showLocked = false,
  className,
}: {
  badges: EarnedBadge[];
  showLocked?: boolean;
  className?: string;
}) {
  const earned = new Map(badges.map((b) => [b.badge, b.awarded_at]));
  const kinds = ORDER.filter((kind) => showLocked || earned.has(kind));
  if (kinds.length === 0) return null;

  return (
    <ul aria-label="Badges" className={cn("flex flex-wrap gap-1.5", className)}>
      {kinds.map((kind) => {
        const { name, how, Icon } = BADGES[kind];
        const awardedAt = earned.get(kind);
        const locked = !awardedAt;
        return (
          <li key={kind}>
            <InfoTip
              content={
                <>
                  {locked
                    ? `How to get it: ${how.charAt(0).toLowerCase()}${how.slice(1)}`
                    : how}
                  {awardedAt
                    ? ` Earned ${earnedOn.format(new Date(awardedAt))}.`
                    : null}
                </>
              }
            >
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 cursor-help items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium focus-ring outline-none",
                  locked
                    ? "border-dashed text-muted-foreground"
                    : kind === "golden_ear"
                      ? "border-transparent bg-gold-soft text-gold"
                      : "border-transparent bg-primary-soft text-primary-text",
                )}
              >
                {locked ? (
                  <LockIcon className="size-3.5" aria-hidden="true" />
                ) : (
                  <Icon className="size-3.5" aria-hidden="true" />
                )}
                {name}
                {locked ? (
                  <span className="sr-only"> (not earned yet)</span>
                ) : null}
              </button>
            </InfoTip>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Badges as small icons next to a name, for the comment list. Golden ear is
 * left out there: the reputation chip next to it already says so.
 */
export function BadgeIcons({
  badges,
  className,
}: {
  badges: BadgeKind[];
  className?: string;
}) {
  const kinds = ORDER.filter(
    (kind) => kind !== "golden_ear" && badges.includes(kind),
  );
  if (kinds.length === 0) return null;
  return (
    <ul
      aria-label="Badges"
      className={cn("flex items-center gap-0.5", className)}
    >
      {kinds.map((kind) => {
        const { name, how, Icon } = BADGES[kind];
        return (
          <li key={kind}>
            <InfoTip
              content={
                <>
                  <span className="font-medium">{name}.</span> {how}
                </>
              }
            >
              <button
                type="button"
                aria-label={name}
                className="touch-hit grid size-5 cursor-help place-items-center rounded-full bg-primary-soft text-primary-text focus-ring outline-none"
              >
                <Icon className="size-3" aria-hidden="true" />
              </button>
            </InfoTip>
          </li>
        );
      })}
    </ul>
  );
}
