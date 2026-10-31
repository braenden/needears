import { cn } from "@/lib/utils";

export type ProfileStatsV2 = {
  commentsGiven: number;
  helpfulReceived: number;
  /** Share of comments given that were marked Helpful, 0 to 1. */
  helpfulShare: number;
  /** Weeks in a row with at least one comment, this week included. */
  weekStreak: number;
};

const percent = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 0,
});

/**
 * Four numbers about how someone gives feedback. The Helpful share is the one
 * that says something about quality, so it gets a short explanation.
 */
export function ProfileStatsBlock({
  stats,
  className,
}: {
  stats: ProfileStatsV2;
  className?: string;
}) {
  const items: { label: string; value: string; note?: string }[] = [
    { label: "Comments given", value: String(stats.commentsGiven) },
    { label: "Helpful received", value: String(stats.helpfulReceived) },
    {
      label: "Marked Helpful",
      value: stats.commentsGiven
        ? percent.format(stats.helpfulShare)
        : "None yet",
      note: "of their comments",
    },
    {
      label: "Week streak",
      value:
        stats.weekStreak === 0
          ? "None yet"
          : `${stats.weekStreak} ${stats.weekStreak === 1 ? "week" : "weeks"}`,
      note: "commenting every week",
    },
  ];
  return (
    <dl
      className={cn(
        "@container grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border @lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col-reverse gap-0.5 bg-card px-3 py-3 @sm:px-4"
        >
          <dt className="text-xs leading-tight text-muted-foreground">
            {item.label}
            {item.note ? <span className="block">{item.note}</span> : null}
          </dt>
          <dd data-numeric className="text-xl font-semibold @sm:text-2xl">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
