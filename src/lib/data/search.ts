import "server-only";
import { SEARCH_MIN_LENGTH } from "@/config/limits";
import { createClient } from "@/lib/supabase/server";
import type { ProfileSummary } from "@/types/view";
import { withAvatars } from "./avatars";
import { type CardTrack, getTracksByIds } from "./tracks";

const RESULTS = 20;
const GROUP_RESULTS = 10;

type Owner = ProfileSummary & { avatar_key: string | null };

/** A group found by its name: its card, as anyone can see it. */
export type GroupHit = {
  id: string;
  slug: string;
  name: string;
  members_count: number;
  owner_name: string;
};

export type SearchOutcome = {
  groups: GroupHit[];
  tracks: CardTrack[];
  profiles: ProfileSummary[];
  failed: boolean;
};

/**
 * Groups, tracks and people matching the query, best match first.
 * `search_groups()` finds groups by name; `search()` finds tracks and
 * people (as the visitor, so only live tracks, never a group's). The rows
 * need a little more: the tracks as in the feed, so they play, and the
 * people's pictures. Shorter queries than the database searches return
 * nothing without asking.
 */
export async function searchAll(query: string): Promise<SearchOutcome> {
  const q = query.trim();
  if (q.length < SEARCH_MIN_LENGTH)
    return { groups: [], tracks: [], profiles: [], failed: false };
  const supabase = await createClient();
  const [hits, groups] = await Promise.all([
    supabase.rpc("search", { p_query: q, p_limit: RESULTS }),
    supabase.rpc("search_groups", { p_query: q, p_limit: GROUP_RESULTS }),
  ]);
  if (groups.error) console.error("Group search failed", groups.error.code);
  if (hits.error) {
    console.error("Search failed", hits.error.code);
    return { groups: [], tracks: [], profiles: [], failed: true };
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
    return { groups: [], tracks: [], profiles: [], failed: true };
  }

  // Back in the order search() ranked them.
  const peopleRows = [...(people.data as Owner[])].sort(
    (a, b) => profileIds.indexOf(a.id) - profileIds.indexOf(b.id),
  );
  return {
    groups: (groups.data ?? []).map(
      ({ id, slug, name, members_count, owner_name }) => ({
        id,
        slug,
        name,
        members_count,
        owner_name,
      }),
    ),
    tracks,
    profiles: await withAvatars(supabase, peopleRows),
    failed: false,
  };
}
