import type { WeeklyLeader } from "@/components/feed/weekly-ears";

import { jonas, longName, mia, newcomer, nora, sam } from "./profiles";

/** Monday 2 November 2026, 00:00 in Oslo. */
export const weekResetsAt = "2026-11-01T23:00:00Z";

const extra = (handle: string, name: string) => ({
  id: `u-${handle}`,
  handle,
  display_name: name,
  avatar_url: null,
  reputation: 6,
});

export const weeklyLeaders: WeeklyLeader[] = [
  { profile: mia, helpful: 14, rank: 1 },
  { profile: longName, helpful: 9, rank: 2 },
  { profile: jonas, helpful: 6, rank: 3 },
  { profile: extra("lofi_lars", "Lars"), helpful: 5, rank: 4 },
  { profile: extra("ana_beats", "Ana"), helpful: 5, rank: 4 },
  { profile: sam, helpful: 4, rank: 6 },
  { profile: extra("kick_drum_kim", "Kim"), helpful: 3, rank: 7 },
  { profile: nora, helpful: 2, rank: 8 },
  { profile: extra("modular_mo", "Mo"), helpful: 2, rank: 8 },
  { profile: newcomer, helpful: 1, rank: 10 },
];
