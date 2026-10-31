// Badges and the weekly list. The database awards the badges with the same
// rules (supabase/migrations/*_badges_and_stats.sql); this file is what the
// pages show and explain.

export type BadgeId =
  "first_ears" | "finisher" | "ten_tracks_helped" | "golden_ear";

// Different track owners whose Helpful earns ten_tracks_helped.
export const HELPED_OWNERS_FOR_BADGE = 10;
// People on the weekly list of most helpful ears (Monday to Sunday, Oslo).
export const WEEKLY_LEADERS = 10;
export const WEEK_TIME_ZONE = "Europe/Oslo";

export const badges: readonly { id: BadgeId; name: string; how: string }[] = [
  {
    id: "first_ears",
    name: "First ears",
    how: "Be the first to comment on someone's track.",
  },
  {
    id: "finisher",
    name: "Finisher",
    how: "Upload a new version of a track after getting feedback on it.",
  },
  {
    id: "ten_tracks_helped",
    name: "Ten tracks helped",
    how: "Get Helpful from ten different producers.",
  },
  {
    id: "golden_ear",
    name: "Golden ear",
    how: "Reach the Golden ear level.",
  },
];
