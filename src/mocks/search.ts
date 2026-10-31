import type { TrackHit } from "@/components/search/search-results";
import type { ProfileSummary } from "@/types/view";

import { jonas, longName, mia, newcomer, nora, sam } from "./profiles";
import { tracks } from "./tracks";

const people: ProfileSummary[] = [nora, jonas, mia, sam, newcomer, longName];

/** Case-insensitive contains on titles, names and handles, like a rough pg_trgm. */
export function searchMock(query: string): {
  tracks: TrackHit[];
  profiles: ProfileSummary[];
} {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { tracks: [], profiles: [] };
  return {
    tracks: tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.genre.name.toLowerCase().includes(q),
    ),
    profiles: people.filter(
      (p) =>
        p.handle.toLowerCase().includes(q) ||
        (p.display_name ?? "").toLowerCase().includes(q),
    ),
  };
}
