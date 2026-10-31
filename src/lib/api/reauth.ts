// How recent the session's own sign-in must be for actions that hand over
// the account: deleting it (checked by /api/account/delete), and connecting
// or disconnecting a way to sign in. Those last two can be done straight
// against Supabase's API, so the database enforces the window for them
// (private.reauth_window()); this page only checks it to show the right
// button. Keep this value equal to private.reauth_window().
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;

// When the session presenting a request last proved who it is, from the
// `amr` claim of its access token: one entry per method (password, otp,
// oauth, ...) with a UNIX timestamp in seconds. Refreshing a token keeps
// the original entries, so an old session stays old however often it is
// refreshed. Returns milliseconds, or null when the claim has no
// timestamps (the RFC 8176 string form).
export function sessionAuthenticatedAt(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    const timestamp =
      typeof entry === "object" && entry !== null
        ? (entry as { timestamp?: unknown }).timestamp
        : undefined;
    if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
      latest = Math.max(latest ?? 0, timestamp * 1000);
    }
  }
  return latest;
}

// True when the session signed in within `windowMs` of `now`.
export function isFreshSession(
  amr: unknown,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const at = sessionAuthenticatedAt(amr);
  return at !== null && at <= now + 60_000 && now - at <= windowMs;
}
