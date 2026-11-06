import "server-only";
import { SEARCH_MIN_LENGTH } from "@/config/limits";
import { createClient } from "@/lib/supabase/server";
import type { ProfileSummary } from "@/types/view";
import { withAvatars } from "./avatars";
import { type CardTrack, getTracksByIds } from "./tracks";

const RESULTS = 20;

type Owner = ProfileSummary & { avatar_key: string | null };

export type SearchOutcome = {
  tracks: CardTrack[];
  profiles: ProfileSummary[];
  failed: boolean;
};

/**
 * Tracks and people matching the query, best match first. `search()` finds
 * them (as the visitor, so only live tracks); the rows need a little more:
 * the tracks as in the feed, so they play, and the people's pictures.
 * Shorter queries than the database searches return nothing without asking.
 */
export async function searchAll(query: string): Promise<SearchOutcome> {
  const q = query.trim();
  if (q.length < SEARCH_MIN_LENGTH)
    return { tracks: [], profiles: [], failed: false };
  const supabase = await createClient();
  const hits = await supabase.rpc("search", { p_query: q, p_limit: RESULTS });
  if (hits.error) {
    console.error("Search failed", hits.error.code);
    return { tracks: [], profiles: [], failed: true };
  }
  const trackIds = hits.data.filter((h) => h.kind === "track").map((h) => h.id);
  const profileIds = hits.data
    .filter((h) => h.kind !== "track")
    .map((h) => h.id);

  const [tracks, people] = await Promise.all([
    getTracksByIds(trackIds).catch(() => null),
    profileIds.length > 0
      ? supabase
          .from("profiles")
          .select(
            "id, handle, display_name, avatar_url, avatar_key, reputation",
          )
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (!tracks || people.error) {
    console.error("Search details failed");
    return { tracks: [], profiles: [], failed: true };
  }

  // Back in the order search() ranked them.
  const peopleRows = [...(people.data as Owner[])].sort(
    (a, b) => profileIds.indexOf(a.id) - profileIds.indexOf(b.id),
  );
  return {
    tracks,
    profiles: await withAvatars(supabase, peopleRows),
    failed: false,
  };
}
