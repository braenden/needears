import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/api/redirect";
import { SIGNED_IN_HASH } from "@/lib/auth/last-login";
import { createClient } from "@/lib/supabase/server";

// Return URL for magic links and for connecting a Google account in
// Settings (PKCE). Exchanges the one time code for a session cookie and
// sends the user on. First time in, they pick a handle at /welcome before
// going on to where they were.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const origin = request.nextUrl.origin;
  const next = safeNext(params.get("next"), origin);
  // Connecting an account in Settings, not signing in.
  const linking =
    next.pathname === "/settings" && next.searchParams.has("linked");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const to =
        data.user.user_metadata.onboarded !== true
          ? new URL("/welcome", origin)
          : new URL(next);
      if (to.pathname === "/welcome")
        to.searchParams.set("next", next.pathname + next.search);
      // Signed in by email: the next page remembers it in the browser
      // (RememberLogin).
      if (!linking) to.hash = SIGNED_IN_HASH;
      return NextResponse.redirect(to);
    }
  }
  // Supabase sends errors back here too, for example a Google account that
  // already belongs to someone else. Settings explains those.
  if (linking) {
    const failed = params.get("error_code") ?? params.get("error") ?? "failed";
    const settings = new URL("/settings", origin);
    settings.searchParams.set("link_error", failed.slice(0, 60));
    return NextResponse.redirect(settings);
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
