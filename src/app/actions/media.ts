"use server";

import { signAudio } from "@/lib/data/media";
import { createClient } from "@/lib/supabase/server";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A new signed URL for a track's audio, for players that have been open
// longer than the URL lives. Read and signed as the caller, so RLS and the
// Storage policy decide, exactly as on page load.
export async function freshAudioUrl(slug: string): Promise<string | null> {
  if (typeof slug !== "string" || !SLUG.test(slug) || slug.length > 80)
    return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tracks")
    .select("audio_key")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  const urls = await signAudio(supabase, [data.audio_key]);
  return urls.get(data.audio_key) ?? null;
}
