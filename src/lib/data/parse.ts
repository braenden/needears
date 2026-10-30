import { FEED_MAX_PAGE } from "@/config/limits";
import type { Json } from "@/types/database";
import type { ReactionCounts } from "@/types/view";

// Small parsers for values that come from the database or the URL.

// The cached reaction_counts jsonb, with every kind present.
export function reactionCounts(value: Json): ReactionCounts {
  const counts = (value ?? {}) as Partial<Record<string, unknown>>;
  const read = (k: string) =>
    typeof counts[k] === "number" ? (counts[k] as number) : 0;
  return {
    fire: read("fire"),
    heart: read("heart"),
    eyes: read("eyes"),
    headphones: read("headphones"),
  };
}

// ?page= from the URL: a whole number from 1 to FEED_MAX_PAGE.
export function clampPage(value: unknown): number {
  const page = Number.parseInt(String(value ?? "1"), 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, FEED_MAX_PAGE);
}
