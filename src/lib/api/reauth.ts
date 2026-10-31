// How recent the session's own sign in must be for account deletion and
// for adding or removing a way to sign in (POST /api/account/identity-intent,
// whose intent the database requires for the change).
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;

// The `amr` methods that are a sign in. Others (totp, phone, webauthn) can
// be added to an existing session by whoever holds it, so they do not make
// a session fresh.
export const SIGN_IN_METHODS = [
  "otp",
  "magiclink",
  "oauth",
  "password",
  "email/signup",
];

// When the session presenting a request last signed in, from the `amr`
// claim of its access token: one entry per method (password, otp, oauth,
// ...) with a UNIX timestamp in seconds. Only SIGN_IN_METHODS count. Refreshing a token keeps
// the original entries, so an old session stays old however often it is
// refreshed. Returns milliseconds, or null when the claim has no
// timestamps (the RFC 8176 string form).
export function sessionAuthenticatedAt(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    if (typeof entry !== "object" || entry === null) continue;
    const { method, timestamp } = entry as {
      method?: unknown;
      timestamp?: unknown;
    };
    if (typeof method !== "string" || !SIGN_IN_METHODS.includes(method))
      continue;
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
