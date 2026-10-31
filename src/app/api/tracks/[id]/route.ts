import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { databaseError, jsonError } from "@/lib/api/http";
import { createAdminClient } from "@/lib/supabase/admin";

// Deletes a track and the audio and peaks of all its versions. Users have no delete grant on
// tracks, so this route is the only way, and the files always go with the
// row. Owners can delete live tracks without open reports; tracks hidden or
// taken down by moderation, and reported ones, stay as a record until an
// admin deletes them (or the owner deletes their whole account).
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/tracks/[id]">,
) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return jsonError(404, "not_found", "No such track.");

  // Read with the user's client, so RLS decides whether they can see it.
  const [track, admin] = await Promise.all([
    auth.supabase
      .from("tracks")
      .select("owner_id, status")
      .eq("id", id)
      .maybeSingle(),
    auth.supabase.rpc("is_admin"),
  ]);
  if (track.error) return databaseError(track.error);
  if (admin.error) return databaseError(admin.error);
  if (!track.data) return jsonError(404, "not_found", "No such track.");

  const isOwner = track.data.owner_id === auth.user.id;
  if (!admin.data && !isOwner)
    return jsonError(404, "not_found", "No such track.");
  if (!admin.data && track.data.status !== "live") {
    return jsonError(
      403,
      "under_review",
      "This track is under review and cannot be deleted now.",
    );
  }

  const service = createAdminClient();
  // Open reports on the track or its comments would cascade away with it.
  if (!admin.data) {
    const review = await service.rpc("track_under_review", { p_track: id });
    if (review.error) return databaseError(review.error);
    if (review.data) {
      return jsonError(
        403,
        "under_review",
        "This track is under review and cannot be deleted now.",
      );
    }
  }

  let query = service.from("tracks").delete().eq("id", id);
  // Repeat the checks in the delete itself, in case the track was hidden
  // between the read above and now.
  if (!admin.data)
    query = query.eq("owner_id", auth.user.id).eq("status", "live");
  // Every version's files go with the track.
  const versions = await service
    .from("track_versions")
    .select("audio_key, peaks_key")
    .eq("track_id", id);
  if (versions.error) return databaseError(versions.error);
  const deleted = await query.select("audio_key, peaks_key").maybeSingle();
  if (deleted.error) return databaseError(deleted.error);
  if (!deleted.data) return jsonError(404, "not_found", "No such track.");

  const files = [deleted.data, ...versions.data];
  const [audio, peaks] = await Promise.all([
    service.storage
      .from("audio")
      .remove([...new Set(files.map((f) => f.audio_key))]),
    service.storage
      .from("peaks")
      .remove([...new Set(files.map((f) => f.peaks_key))]),
  ]);
  if (audio.error || peaks.error) {
    console.error("Track deleted but objects remain", id);
  }

  return new Response(null, { status: 204 });
}
