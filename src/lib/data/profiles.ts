import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { Genre, Profile, ProfileStats } from "@/types/view";

function anonClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// The fixed genre list (seeded by a migration). Public, so cached across
// requests, but only filled at request time: the build has no Supabase
// settings, and CI builds without them.
export async function getGenres(): Promise<Genre[]> {
  await connection();
  return cachedGenres();
}

async function cachedGenres(): Promise<Genre[]> {
  "use cache";
  cacheLife("days");
  const { data, error } = await anonClient()
    .from("genres")
    .select("slug, name")
    .order("name");
  if (error) throw new Error(`Genres failed: ${error.code}`);
  return data;
}

const PROFILE_COLUMNS =
  "id, handle, display_name, avatar_url, reputation, bio, created_at";

export async function getProfileByHandle(
  handle: string,
): Promise<Profile | null> {
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw new Error(`Profile failed: ${error.code}`);
  return data;
}

// Counts for the profile header. Helpful received is the reputation, which
// a trigger keeps equal to the number of Helpful marks.
export async function getProfileStats(
  profile: Pick<Profile, "id" | "reputation">,
): Promise<ProfileStats> {
  const supabase = await createClient();
  const [tracks, comments] = await Promise.all([
    supabase
      .from("tracks")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", profile.id)
      .eq("status", "live"),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", profile.id)
      .eq("status", "live"),
  ]);
  return {
    tracks: tracks.count ?? 0,
    commentsGiven: comments.count ?? 0,
    helpfulReceived: profile.reputation,
  };
}

export type GivenComment = {
  id: string;
  body: string;
  time_ms: number | null;
  is_helpful: boolean;
  created_at: string;
  track: { slug: string; title: string } | null;
};

// Recent comments a person has given, for the Comments tab on a profile.
export async function getCommentsBy(
  authorId: string,
  limit = 30,
): Promise<GivenComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, body, time_ms, is_helpful, created_at, track:tracks!comments_track_id_fkey(slug, title)",
    )
    .eq("author_id", authorId)
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Comments failed: ${error.code}`);
  return data.filter((c) => c.track);
}
