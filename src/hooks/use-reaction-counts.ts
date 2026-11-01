"use client";

import { useState, useSyncExternalStore } from "react";

import type { ReactionCounts } from "@/types/view";

// The newest reaction counts this tab has seen, by track. The track page
// shares its counts here, so cards on pages the browser kept (the feed when
// going back) show the same numbers without loading again. Each share gets
// a number in order, and a card only uses counts shared after it got its
// own, so a fresh page never shows older numbers than it loaded.
type Shared = { counts: ReactionCounts; order: number };

const latest = new Map<string, Shared>();
const listeners = new Set<() => void>();
let order = 0;

export function shareReactionCounts(trackId: string, counts: ReactionCounts) {
  if (latest.get(trackId)?.counts === counts) return;
  latest.set(trackId, { counts, order: ++order });
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The newest counts for a track: shared ones if newer than `loaded`. */
export function useReactionCounts(
  trackId: string,
  loaded: ReactionCounts,
): ReactionCounts {
  // When these counts arrived, in the same order as the shares.
  const [since, setSince] = useState({ counts: loaded, order });
  if (since.counts !== loaded) setSince({ counts: loaded, order });
  const shared = useSyncExternalStore(
    subscribe,
    () => latest.get(trackId),
    () => undefined,
  );
  return shared && shared.order > since.order ? shared.counts : loaded;
}
