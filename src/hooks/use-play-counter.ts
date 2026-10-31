"use client";

import { useCallback, useRef } from "react";

import { listenedAfter, playThresholdMs } from "@/lib/plays";

const storageKey = (trackId: string) => `played:${trackId}`;

function alreadyCounted(trackId: string) {
  try {
    return sessionStorage.getItem(storageKey(trackId)) === "1";
  } catch {
    return false;
  }
}

function markCounted(trackId: string) {
  try {
    sessionStorage.setItem(storageKey(trackId), "1");
  } catch {
    // Private mode without storage: the server still counts one an hour.
  }
}

/**
 * Feed it the player's time reports. After 30 seconds of listening it asks
 * the server to count a play, once per track per browser session.
 */
export function usePlayCounter(trackId: string, durationMs: number) {
  const listened = useRef(0);
  const last = useRef<number | null>(null);
  const sent = useRef(false);

  return useCallback(
    (ms: number) => {
      listened.current = listenedAfter(listened.current, last.current, ms);
      last.current = ms;
      if (sent.current || listened.current < playThresholdMs(durationMs))
        return;
      sent.current = true;
      if (alreadyCounted(trackId)) return;
      markCounted(trackId);
      void fetch(`/api/tracks/${trackId}/play`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {
        // A lost play is not worth bothering the listener about.
      });
    },
    [trackId, durationMs],
  );
}
