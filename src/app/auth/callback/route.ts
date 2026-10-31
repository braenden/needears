import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/api/redirect";
import { SIGNED_IN_HASH } from "@/lib/auth/last-login";
import { createClient } from "@/lib/supabase/server";

// Return URL for Google OAuth and magic links (PKCE). Exchanges the one time
// code for a session cookie and sends the user on. First time in, they pick
// a handle at /welcome before going on to where they were.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;
  const next = safeNext(request.nextUrl.searchParams.get("next"), origin);
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Signed in: the next page remembers it in the browser (RememberLogin).
      const to =
        data.user.user_metadata.onboarded !== true
          ? new URL("/welcome", origin)
          : new URL(next);
      if (to.pathname === "/welcome")
        to.searchParams.set("next", next.pathname + next.search);
      to.hash = SIGNED_IN_HASH;
      return NextResponse.redirect(to);
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
