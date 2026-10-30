import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/types/database";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Supabase client for server components, server functions and route
// handlers, acting as the signed in user (or anon). RLS applies.
// Create a new one per request.
export async function createClient() {
  // Session checks read the clock, so a client only ever exists at request
  // time, never while Next.js prerenders (metadata included).
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies. The proxy refreshes the
          // session on the next request instead.
        }
      },
    },
  });
}
