import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonError } from "@/lib/api/http";
import {
  MARKER_FORMATS,
  renderMarkers,
  type Marker,
} from "@/lib/markers/format";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

const querySchema = z
  .object({
    format: z.enum(MARKER_FORMATS).default("csv"),
    // Version number; the latest when left out.
    version: z.coerce.number().int().min(1).max(10).optional(),
  })
  // Unknown parameters would each make a new cache key.
  .strict();

const CONTENT_TYPES = {
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  reaper: "text/csv; charset=utf-8",
} as const;

// The comments on a track as DAW markers: CSV, plain text or Reaper's marker
// list. Reads with the anon key, so only live tracks and live comments come
// out, the same as anyone can see on the track page. Top level comments
// with a time only; replies share their parent's time. Cached briefly at
// the edge, which also keeps repeated downloads off the database.
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/tracks/[id]/markers">,
) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return jsonError(404, "not_found", "No such track.");

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = querySchema.safeParse(params);
  if (!query.success)
    return jsonError(400, "invalid_format", "Use format=csv, txt or reaper.");
  const { format, version } = query.data;

  const supabase = createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const track = await supabase
    .from("tracks")
    .select("slug, versions:track_versions(id, version_no)")
    .eq("id", id)
    .maybeSingle();
  if (track.error || !track.data)
    return jsonError(404, "not_found", "No such track.");

  const versions = [...track.data.versions].sort(
    (a, b) => b.version_no - a.version_no,
  );
  const chosen =
    version === undefined
      ? versions[0]
      : versions.find((v) => v.version_no === version);
  if (!chosen) return jsonError(404, "not_found", "No such version.");

  const comments = await supabase
    .from("comments")
    .select(
      "time_ms, end_ms, category, body, author:profiles!comments_author_id_fkey(handle, display_name)",
    )
    .eq("track_id", id)
    .eq("version_id", chosen.id)
    .is("parent_id", null)
    .not("time_ms", "is", null)
    .order("time_ms")
    .limit(1000);
  if (comments.error)
    return jsonError(500, "markers_failed", "Could not read the comments.");

  const markers: Marker[] = comments.data.map((c) => ({
    timeMs: c.time_ms!,
    endMs: c.end_ms,
    author: c.author?.display_name || c.author?.handle || "Someone",
    category: c.category,
    text: c.body,
  }));

  const extension = format === "txt" ? "txt" : "csv";
  const name = `${track.data.slug}-v${chosen.version_no}-markers${format === "reaper" ? "-reaper" : ""}.${extension}`;

  return new Response(renderMarkers(markers, format), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${name}"`,
      // Short, so a hidden comment or track leaves the edge soon.
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
