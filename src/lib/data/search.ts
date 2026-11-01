import "server-only";
import type { TrackHit } from "@/components/search/search-results";
import { SEARCH_MIN_LENGTH } from "@/config/limits";
import { createClient } from "@/lib/supabase/server";
import type { Genre, ProfileSummary } from "@/types/view";
import { withAvatars } from "./avatars";

const RESULTS = 20;

type Owner = ProfileSummary & { avatar_key: string | null };

export type SearchOutcome = {
  tracks: TrackHit[];
  profiles: ProfileSummary[];
  failed: boolean;
};

/**
 * Tracks and people matching the query, best match first. `search()` finds
 * them (as the visitor, so only live tracks); the cards need a little more,
 * read in two queries. Shorter queries than the database searches return
 * nothing without asking.
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
    trackIds.length > 0
      ? supabase
          .from("tracks")
          .select(
            "id, slug, title, duration_ms, comment_count, listener_comment_count, genre:genres(slug, name), owner:profiles!tracks_owner_id_fkey(id, handle, display_name, avatar_url, avatar_key, reputation)",
          )
          .in("id", trackIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length > 0
      ? supabase
          .from("profiles")
          .select(
            "id, handle, display_name, avatar_url, avatar_key, reputation",
          )
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tracks.error || people.error) {
    console.error("Search details failed");
    return { tracks: [], profiles: [], failed: true };
  }

  // Back in the order search() ranked them.
  const order = (ids: string[]) => (a: { id: string }, b: { id: string }) =>
    ids.indexOf(a.id) - ids.indexOf(b.id);
  const trackRows = (
    tracks.data as unknown as (Omit<TrackHit, "genre" | "owner"> & {
      genre: Genre | null;
      owner: Owner | null;
    })[]
  )
    .filter((t) => t.genre && t.owner)
    .sort(order(trackIds));
  const peopleRows = [...(people.data as Owner[])].sort(order(profileIds));

  const signed = await withAvatars(supabase, [
    ...trackRows.map((t) => t.owner!),
    ...peopleRows,
  ]);
  return {
    tracks: trackRows.map((t, i) => ({
      ...t,
      genre: t.genre!,
      owner: signed[i]!,
    })),
    profiles: signed.slice(trackRows.length),
    failed: false,
  };
}
