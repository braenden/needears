/** A play counts after this much listening, or the whole track if it is shorter. */
export const PLAY_AFTER_MS = 30_000;

export function playThresholdMs(durationMs: number) {
  // The player reports whole seconds, so the last second of a short track
  // never shows up as listened.
  return Math.max(1000, Math.min(PLAY_AFTER_MS, durationMs - 1000));
}

/**
 * Seconds actually listened, from the player's once-a-second time reports.
 * A step of one second is playback; anything else is a seek and adds nothing.
 */
export function listenedAfter(
  listenedMs: number,
  lastMs: number | null,
  ms: number,
) {
  return lastMs !== null && ms - lastMs === 1000
    ? listenedMs + 1000
    : listenedMs;
}

/** "1 play", "1,380 plays". */
export function formatPlays(count: number) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "play" : "plays"}`;
}
