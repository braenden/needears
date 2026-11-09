import { z } from "zod";
import { BodyError, jsonError, readJson } from "@/lib/api/http";
import { googleClientId } from "@/lib/auth/google-client-id";
import {
  exchangeGoogleCode,
  googleClientSecret,
  usableGoogleIdToken,
} from "@/lib/auth/google-code";

// Codes from Google's popup are short and printable ("4/0A...").
const bodySchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[\x21-\x7e]+$/),
  })
  .strict();

// Expected origin: only our sign in page asks.
function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

const noStore = { "Cache-Control": "no-store" };

// Signing in with Google. The login page opens Google's account chooser
// (the code client of Google Identity Services, in a popup, so Google names
// our own site) and sends us the one time code it gets back. We swap it for
// Google's ID token with our client secret, check the token is meant for
// us, and hand it back to the page, which signs in with it at Supabase the
// way it signs in with any ID token. Supabase checks the signature.
//
// The token carries no nonce, since the code client has none. It reaches
// only our own page, which then holds the session it is worth anyway.
// Neither the code nor the token is ever logged.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== siteOrigin(request))
    return jsonError(403, "bad_origin", "Cross-site requests are not allowed.");
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return jsonError(415, "invalid_body", "Send JSON.");

  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret)
    return jsonError(503, "not_configured", "Google sign-in is not set up.");

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

  return Response.json({ idToken: exchange.idToken }, { headers: noStore });
}
