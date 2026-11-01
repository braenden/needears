import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { peaksSchema } from "@/lib/audio/peaks";
import { displayPeaks, downsample } from "@/lib/audio/waveform";
import { presignAudioPlayback } from "@/lib/storage/r2";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type UserClient = Awaited<ReturnType<typeof createClient>>;

// Signed URLs live for an hour. Pages are rendered per request,
// so a URL is always fresh when the page loads; the player asks for a new
// one if it has expired (src/app/actions/media.ts).
export const SIGNED_URL_SECONDS = 3600;

// Presigns audio for the visitor. Only keys of versions the visitor can
// read in track_versions with their own client (anon when signed out) get
// a URL, so RLS decides exactly as it did for the old Storage policy: live
// tracks for everyone, hidden and taken down ones only for their owner and
// admins. One query for the whole page. Never use the service role here
// (issue 020).
export async function signAudio(
  supabase: UserClient,
  keys: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const wanted = [...new Set(keys)];
  if (wanted.length === 0) return urls;
  const { data, error } = await supabase
    .from("track_versions")
    .select("audio_key")
    .in("audio_key", wanted);
  if (error) {
    console.error("Could not check audio", error.code);
    return urls;
  }
  // One bad key costs only its own track.
  await Promise.all(
    data.map(async ({ audio_key }) => {
      try {
        urls.set(
          audio_key,
          await presignAudioPlayback(audio_key, SIGNED_URL_SECONDS),
        );
      } catch (error) {
        console.error("Could not sign audio", (error as Error).message);
      }
    }),
  );
  return urls;
}

// Peaks of a live track, cached across requests: a peaks file never
// changes once uploaded. Downloaded with the anon key, so Storage only
// hands out files of live tracks; callers only pass keys of tracks the
// visitor's own query returned. Null when anon cannot read it (a hidden
// track seen by its owner), and the caller falls back to the user client.
async function livePeaks(key: string): Promise<number[] | null> {
  "use cache";
  cacheLife("hours");
  const anon = createSupabaseClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const file = await anon.storage.from("peaks").download(key);
  if (file.error) return null;
  return parsePeaks(await file.data.text());
}

function parsePeaks(text: string): number[] | null {
  try {
    const parsed = peaksSchema.safeParse(JSON.parse(text));
    return parsed.success ? displayPeaks(parsed.data) : null;
  } catch {
    return null;
  }
}

// Display peaks (0 to 1) for each key. `bars` downsamples for cards, which
// keeps the HTML small. Missing files give a flat line rather than an error.
export async function loadPeaks(
  supabase: UserClient,
  keys: string[],
  bars?: number,
): Promise<Map<string, number[]>> {
  // The cached download below must never run while Next.js prerenders.
  await connection();
  const entries = await Promise.all(
    keys.map(async (key) => {
      let peaks = await livePeaks(key);
      if (!peaks) {
        const file = await supabase.storage.from("peaks").download(key);
        peaks = file.error ? null : parsePeaks(await file.data.text());
      }
      const values = peaks ?? [];
      const shaped = bars ? downsample(values, bars) : values;
      // Two decimals is plenty for drawing and halves the payload.
      return [key, shaped.map((v) => Math.round(v * 100) / 100)] as const;
    }),
  );
  return new Map(entries);
}
