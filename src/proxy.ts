import type { NextRequest } from "next/server";
import { sentryOrigin } from "@/lib/monitoring/sentry";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

const CSP_HEADER = "Content-Security-Policy";

// Runs before every page and route handler: sets a nonce based CSP and
// refreshes the Supabase session cookie. Next.js reads the nonce from the
// CSP request header and puts it on the scripts it renders, which is why
// every page is rendered per request (see src/app/layout.tsx).
export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const csp = buildCsp({
    nonce,
    supabaseOrigin: new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost",
    ).origin,
    isDev: process.env.NODE_ENV === "development",
    upgradeInsecure: siteUrl.startsWith("https://"),
    sentryOrigin: sentryOrigin(),
  });
  request.headers.set(CSP_HEADER, csp);
  request.headers.set("x-nonce", nonce);

  const response = await updateSession(request);
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  // Skip build assets, the public OG and health endpoints and image files
  // at the root (icon.svg). Only root level: a page path like
  // /t/name.png must still get the CSP and a fresh nonce.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/og|api/tracks/[^/]+/markers$|[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
