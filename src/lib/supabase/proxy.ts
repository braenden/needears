import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Refreshes the session cookie on every request, so server components and
// route handlers see a valid session. Called from src/proxy.ts. This is not
// an authorization check: every route handler checks the user itself.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // `headers` keeps a CDN from caching a response that carries one
        // person's refreshed session cookie (Cache-Control: no-store).
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers ?? {}))
            response.headers.set(key, value);
        },
      },
    },
  );

  // Do not put code between createServerClient and getClaims: it is what
  // triggers the refresh.
  await supabase.auth.getClaims();

  return response;
}
