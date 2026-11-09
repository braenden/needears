import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/api/redirect";
import { signedInHash } from "@/lib/auth/last-login";
import { createClient } from "@/lib/supabase/server";

// Return URL for magic links (PKCE). Exchanges the one time code for a
// session cookie and sends the user on. First time in, they pick a handle
// at /welcome before going on to where they were. The next page remembers
// that they signed in with email.
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
      to.hash = signedInHash();
      return NextResponse.redirect(to);
    }
  }
  // Where it was going comes along, so the page can say more (an email
  // change opened in another browser) and go there after signing in.
  const failed = new URL("/login?error=link", origin);
  if (next.pathname !== "/")
    failed.searchParams.set("next", next.pathname + next.search);
  return NextResponse.redirect(failed);
}
