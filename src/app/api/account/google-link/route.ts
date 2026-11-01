import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { BodyError, jsonError, readJson } from "@/lib/api/http";
import { isFreshSession, REAUTH_WINDOW_MS } from "@/lib/api/reauth";
import { googleClientId } from "@/lib/auth/google-client-id";
import {
  exchangeGoogleCode,
  googleClientSecret,
  usableGoogleIdToken,
} from "@/lib/auth/google-code";

const bodySchema = z.object({ code: z.string().min(1).max(2048) }).strict();

// Supabase's reasons that the page explains; anything else is general.
const KNOWN_LINK_ERRORS = new Set([
  "identity_already_exists",
  "manual_linking_disabled",
]);

// Step 2 of connecting Google from Settings, after the go-ahead from
// /api/account/identity-intent. Takes the code from Google's popup, swaps it
// for an ID token with our client secret and links that token to the
// signed in account. The database only allows the link with the intent from
// step 1. Only for the browser session: the link replaces its cookies.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  if (auth.via !== "cookie")
    return jsonError(401, "unauthenticated", "Sign in first.");

  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret)
    return jsonError(503, "not_configured", "Connecting Google is not set up.");

  let body;
  try {
    body = bodySchema.safeParse(await readJson(request, 4096));
  } catch (error) {
    if (error instanceof BodyError)
      return jsonError(400, "invalid_body", error.message);
    throw error;
  }
  if (!body.success)
    return jsonError(400, "invalid_code", "Send the code from Google.");

  const claims = await auth.supabase.auth.getClaims();
  if (
    claims.error ||
    !isFreshSession(claims.data?.claims.amr, REAUTH_WINDOW_MS)
  )
    return jsonError(403, "reauth_required", "Sign in again to continue.");

  const exchange = await exchangeGoogleCode(
    body.data.code,
    clientId,
    clientSecret,
  );
  if (!exchange.ok)
    return exchange.reason === "rejected"
      ? jsonError(400, "invalid_code", "Google did not accept the code.")
      : jsonError(502, "google_unavailable", "Google did not answer.");
  if (!usableGoogleIdToken(exchange.idToken, clientId))
    return jsonError(400, "invalid_token", "Google's answer was not usable.");

  const { error } = await auth.supabase.auth.linkIdentity({
    provider: "google",
    token: exchange.idToken,
  });
  if (error) {
    const code =
      error.code && KNOWN_LINK_ERRORS.has(error.code) ? error.code : null;
    if (!code) console.error("Could not link Google", error.status, error.code);
    return jsonError(
      code ? 422 : 500,
      code ?? "link_failed",
      "Google could not be connected.",
    );
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
