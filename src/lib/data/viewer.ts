import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/view";

export type Viewer = {
  userId: string;
  profile: Profile;
  isAdmin: boolean;
  unread: number;
};

const PROFILE_COLUMNS =
  "id, handle, display_name, avatar_url, reputation, bio, created_at, role";

// The signed in person for this request, or null. Deduplicated per request
// with React.cache, so the layout and the page share one lookup. The JWT is
// verified by getClaims, so this is safe to base decisions on; the database
// still enforces everything with RLS.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Token checks read the clock, so this only ever runs at request time.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;
  const [profile, unread] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);
  if (!profile.data) return null;
  const { role, ...rest } = profile.data;
  return {
    userId,
    profile: rest,
    isAdmin: role === "admin",
    unread: unread.count ?? 0,
  };
});
