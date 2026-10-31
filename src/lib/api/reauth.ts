// How recent a sign in must be for account deletion and for adding or
// removing a way to sign in. The database enforces the same window for
// sign in methods (private.reauth_window() in
// supabase/migrations/20261031190000_identity_link_guard.sql); keep the two
// equal.
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
