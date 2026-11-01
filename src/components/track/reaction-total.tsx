"use client";

import { useReactionCounts } from "@/hooks/use-reaction-counts";
import type { ReactionCounts } from "@/types/view";

/** "3 reactions" on a track card, nothing when there are none. */
export function ReactionTotal({
  trackId,
  counts,
}: {
  trackId: string;
  counts: ReactionCounts;
}) {
  const total = Object.values(useReactionCounts(trackId, counts)).reduce(
    (a, b) => a + b,
    0,
  );
  if (total === 0) return null;
  return (
    <span data-numeric>
      {total} {total === 1 ? "reaction" : "reactions"}
    </span>
  );
}
