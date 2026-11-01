import "server-only";
import type { WeeklyLeader } from "@/components/feed/weekly-ears";
import { createClient } from "@/lib/supabase/server";
import { nextWeekStart } from "@/lib/week";
import { withAvatars } from "./avatars";

const LEADERS_MAX = 10;

/** Ranks by Helpful count. Ties share a rank: 1, 2, 2, 4. */
export function rankLeaders<T extends { helpful: number }>(
  rows: T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.helpful - a.helpful);
  return sorted.slice(0, LEADERS_MAX).map((row) => ({
    ...row,
    rank: 1 + sorted.filter((other) => other.helpful > row.helpful).length,
  }));
}

/**
 * The most helpful ears this week (Monday to Sunday, Oslo time), and when
 * the list starts over. An empty list if it cannot be read. Not shown
 * anywhere right now; kept for a page of its own.
 *
 * @public
 */
export async function getWeeklyLeaders(): Promise<{
  leaders: WeeklyLeader[];
  resetsAt: string;
}> {
  const resetsAt = nextWeekStart();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("weekly_helpful_leaders");
  if (error) {
    console.error("Weekly list failed", error.code);
    return { leaders: [], resetsAt };
  }
  const ranked = rankLeaders(data);
  const profiles = await withAvatars(
    supabase,
    ranked.map((r) => ({
      id: r.user_id,
      handle: r.handle,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      avatar_key: r.avatar_key,
      reputation: r.reputation,
    })),
  );
  return {
    leaders: ranked.map((r, i) => ({
      profile: profiles[i]!,
      helpful: r.helpful,
      rank: r.rank,
    })),
    resetsAt,
  };
}
