import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/api/redirect";
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
      if (data.user.user_metadata.onboarded !== true) {
        const welcome = new URL("/welcome", origin);
        welcome.searchParams.set("next", next.pathname + next.search);
        return NextResponse.redirect(welcome);
      }
      return NextResponse.redirect(next);
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
