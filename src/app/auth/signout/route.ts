import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sign out. A POST from our own pages only, so another site cannot sign
// people out with a link or a hidden form.
export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (request.headers.get("origin") !== origin) {
    return new Response("Cross-site requests are not allowed.", {
      status: 403,
    });
  }
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/", origin), 303);
}
