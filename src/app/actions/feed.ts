"use server";

import { clampPage } from "@/lib/data/parse";
import { getGenres } from "@/lib/data/profiles";
import {
  type CardTrack,
  FEED_TABS,
  type FeedTab,
  getFeed,
} from "@/lib/data/tracks";

// The next page of a feed, for infinite scroll. Public data, read as the
// caller like the page itself. Inputs are checked against the known tabs
// and genres, and the page number is capped.
export async function loadFeedPage(
  tab: string,
  genre: string | null,
  page: number,
): Promise<{ tracks: CardTrack[]; hasMore: boolean }> {
  if (!FEED_TABS.includes(tab as FeedTab))
    return { tracks: [], hasMore: false };
  const genres = await getGenres();
  const known = genre && genres.some((g) => g.slug === genre) ? genre : null;
  return getFeed(tab as FeedTab, known, clampPage(page));
}
