import "server-only";

// Connecting a Google account from Settings. The page opens Google's account
// chooser (the code client of Google Identity Services, in a popup) and
// sends us the one time code it gets back. We swap the code for tokens at
// Google with our client secret, check the ID token is meant for us, and
// hand it to Supabase to link. The ID token never reaches the browser.
//
// There is no nonce: the code client has none, so Google's token carries
// none and Supabase accepts it without one. A replayed token is not a risk
// here, because only our server ever holds it.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** The client secret, or null when connecting Google is not set up. */
export function googleClientSecret(): string | null {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || null;
}

export type CodeExchange =
  | { ok: true; idToken: string }
  | { ok: false; reason: "rejected" | "unavailable" };

/** Swaps the popup's code for Google's ID token. */
export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CodeExchange> {
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        // What Google expects for codes from its popup.
        redirect_uri: "postmessage",
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  // An expired, used or foreign code is a 400 from Google.
  if (response.status >= 400 && response.status < 500)
    return { ok: false, reason: "rejected" };
  if (!response.ok) return { ok: false, reason: "unavailable" };
  const body = (await response.json().catch(() => null)) as {
    id_token?: unknown;
  } | null;
  return typeof body?.id_token === "string"
    ? { ok: true, idToken: body.id_token }
    : { ok: false, reason: "unavailable" };
}

function claimsOf(idToken: string): Record<string, unknown> | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims: unknown = JSON.parse(json);
    return typeof claims === "object" && claims !== null
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether an ID token from Google's token endpoint is one we can link: made
 * for our client, by Google, not expired, with an address Google verified.
 * The signature is checked by Supabase when it links the token.
 */
export function usableGoogleIdToken(
  idToken: string,
  clientId: string,
  now: number = Date.now(),
): boolean {
  const claims = claimsOf(idToken);
  if (!claims) return false;
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId)) return false;
  if (claims.azp !== undefined && claims.azp !== clientId) return false;
  if (typeof claims.iss !== "string" || !ISSUERS.includes(claims.iss))
    return false;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return false;
  return claims.email_verified === true && typeof claims.email === "string";
}
