import "server-only";
import {
  createClient as createSupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { jsonError } from "./http";

type UserClient = Awaited<ReturnType<typeof createCookieClient>>;

export type AuthedRequest = {
  user: User;
  // Acts as the user, RLS applies.
  supabase: UserClient;
  via: "cookie" | "bearer";
  // The bearer access token, or null for cookie sessions (the client reads
  // those from the cookies itself).
  token: string | null;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Expected origin for cookie authenticated writes.
function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

// Resolves the signed in user for a route handler. Accepts the session
// cookie (the app) or `Authorization: Bearer <access token>` (scripts and
// curl). The user is verified with the Auth server, not just decoded.
//
// Cookie authenticated writes must come from our own origin. Session cookies
// are SameSite=Lax already; the Origin check is a second line against CSRF.
// Bearer tokens are never sent automatically by browsers, so they need no
// such check.
export async function requireUser(
  request: Request,
): Promise<AuthedRequest | Response> {
  const header = request.headers.get("authorization");

  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const supabase = createSupabaseClient<Database>(
      supabaseUrl(),
      supabaseAnonKey(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user)
      return jsonError(401, "unauthenticated", "Sign in first.");
    return {
      user: data.user,
      supabase: supabase as unknown as UserClient,
      via: "bearer",
      token,
    };
  }

  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    if (origin !== siteOrigin(request)) {
      return jsonError(
        403,
        "bad_origin",
        "Cross-site requests are not allowed.",
      );
    }
  }

  const supabase = await createCookieClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    return jsonError(401, "unauthenticated", "Sign in first.");
  return { user: data.user, supabase, via: "cookie", token: null };
}
