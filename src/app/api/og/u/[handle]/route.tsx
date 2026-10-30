import { createClient } from "@supabase/supabase-js";
import { ImageResponse } from "next/og";
import { reputationLevelFor } from "@/config/reputation";
import { OG_COLORS } from "@/lib/og/colors";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

const HANDLE = /^[a-z0-9_]{3,20}$/;

// Open Graph image for a profile: name, handle and reputation level. Reads
// public profile columns with the anon key.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/og/u/[handle]">,
) {
  const { handle } = await ctx.params;
  if (!HANDLE.test(handle)) return new Response("Not found", { status: 404 });
  const supabase = createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, display_name, reputation")
    .eq("handle", handle)
    .maybeSingle();
  if (!profile) return new Response("Not found", { status: 404 });
  const level = reputationLevelFor(profile.reputation);

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
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700 }}>
          {profile.display_name || profile.handle}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: OG_COLORS.muted }}>
          @{profile.handle}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 30, color: OG_COLORS.accent }}>
        {level.name} · {profile.reputation} Helpful
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
    },
  );
}
