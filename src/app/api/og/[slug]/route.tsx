import { createClient } from "@supabase/supabase-js";
import { ImageResponse } from "next/og";
import { peaksSchema } from "@/lib/audio/peaks";
import { OG_COLORS } from "@/lib/og/colors";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

const BARS = 90;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Downsamples stored peaks to a fixed number of bars, 0 to 1.
function bars(peaks: number[]): number[] {
  const size = peaks.length / BARS;
  return Array.from({ length: BARS }, (_, i) => {
    const slice = peaks.slice(
      Math.floor(i * size),
      Math.max(Math.floor((i + 1) * size), 1),
    );
    return Math.max(...slice, 0) / 255;
  });
}

// Open Graph image for a track: title, handle and the waveform, in the
// colors of the dark theme. Reads with the anon key, so
// only live tracks render, and the peaks file is downloaded through Storage
// with the same key, so RLS decides there too. The peaks key comes from the
// database, never from the request, so this cannot fetch arbitrary URLs.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/og/[slug]">,
) {
  const { slug } = await ctx.params;
  if (!SLUG.test(slug) || slug.length > 80)
    return new Response("Not found", { status: 404 });

  const supabase = createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: track } = await supabase
    .from("tracks")
    .select(
      "title, peaks_key, waveform_color, owner:profiles!tracks_owner_id_fkey(handle)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!track) return new Response("Not found", { status: 404 });

  let waveform: number[] = Array.from({ length: BARS }, () => 0.3);
  try {
    const file = await supabase.storage.from("peaks").download(track.peaks_key);
    if (file.error) throw file.error;
    const parsed = peaksSchema.safeParse(JSON.parse(await file.data.text()));
    if (parsed.success) waveform = bars(parsed.data.channels[0]!);
  } catch {
    // Keep the flat placeholder waveform.
  }

  const color = track.waveform_color ?? OG_COLORS.accent;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: OG_COLORS.background,
        color: OG_COLORS.foreground,
      }}
    >
      <div style={{ display: "flex", fontSize: 28, color: OG_COLORS.muted }}>
        Need Ears
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {track.title}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: OG_COLORS.muted }}>
          @{track.owner?.handle ?? "unknown"}
        </div>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 4, height: 160 }}
      >
        {waveform.map((value, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: Math.max(6, Math.round(value * 160)),
              background: color,
              borderRadius: 4,
            }}
          />
        ))}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      // Short, so a hidden or taken down track drops off the CDN soon.
      headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
    },
  );
}
