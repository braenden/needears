import { z } from "zod";
import { MAX_DURATION_MS, MIN_DURATION_MS } from "@/config/upload";
import {
  LOUDNESS_MAX,
  LOUDNESS_MIN,
  VERSION_NOTE_MAX,
} from "@/config/versions";
import { requireUser } from "@/lib/api/auth";
import { BodyError, databaseError, jsonError, readJson } from "@/lib/api/http";
import { removeAudio } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import { objectKeys } from "@/lib/upload/keys";
import { verifyUpload } from "@/lib/upload/verify";

const bodySchema = z
  .object({
    objectId: z.uuid().transform((id) => id.toLowerCase()),
    durationMs: z.number().int().min(MIN_DURATION_MS).max(MAX_DURATION_MS),
    loudness: z
      .number()
      .min(LOUDNESS_MIN)
      .max(LOUDNESS_MAX)
      .nullable()
      .default(null),
    note: z.string().trim().max(VERSION_NOTE_MAX).default(""),
  })
  .strict();

// Adds a version to a track. The browser uploads the files with URLs from
// /api/upload/sign (with `trackId`), then calls this route, which verifies
// them like /api/tracks does. The database numbers the version, keeps the
// limits (10 versions, live tracks, the upload limit after 24 hours) and
// makes it the track's current audio.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/tracks/[id]/versions">,
) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return jsonError(404, "not_found", "No such track.");

  let body;
  try {
    body = bodySchema.safeParse(await readJson(request));
  } catch (error) {
    if (error instanceof BodyError)
      return jsonError(400, "invalid_body", error.message);
    throw error;
  }
  if (!body.success)
    return jsonError(400, "invalid_version", "Check the file and the note.");
  const input = body.data;

  // The owner's own client, so RLS decides whether the track is theirs.
  const track = await auth.supabase
    .from("tracks")
    .select("owner_id, status")
    .eq("id", id)
    .maybeSingle();
  if (track.error) return databaseError(track.error);
  if (!track.data || track.data.owner_id !== auth.user.id)
    return jsonError(404, "not_found", "No such track.");

  const keys = objectKeys(auth.user.id, input.objectId);
  const admin = createAdminClient();

  const verified = await verifyUpload(
    admin,
    { userId: auth.user.id, objectId: input.objectId },
    input.durationMs,
  );
  if (!verified.ok) {
    if (verified.retry) return jsonError(503, verified.code, verified.message);
    await removeUnusedObjects(admin, input.objectId, auth.user.id, keys);
    return jsonError(422, verified.code, verified.message);
  }

  const inserted = await admin
    .from("track_versions")
    .insert({
      track_id: id,
      // Numbered by the database.
      version_no: 0,
      audio_key: keys.audioKey,
      peaks_key: keys.peaksKey,
      duration_ms: input.durationMs,
      loudness:
        input.loudness === null ? null : Math.round(input.loudness * 100) / 100,
      note: input.note,
    })
    .select("id, version_no")
    .single();

  if (inserted.error) {
    if (inserted.error.code !== "23505")
      await removeUnusedObjects(admin, input.objectId, auth.user.id, keys);
    return databaseError(inserted.error);
  }

  return Response.json(
    { id: inserted.data.id, versionNo: inserted.data.version_no },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

// Removes a rejected upload. Discarding the reservation first, under a row
// lock, means no request still in flight can turn it into a track (the
// insert triggers need it), so the files are never deleted under a track
// that was just created. When the reservation is already gone (used by a
// track, or expired), nothing is removed here; the cleanup cron handles
// what nothing uses.
async function removeUnusedObjects(
  admin: ReturnType<typeof createAdminClient>,
  objectId: string,
  userId: string,
  keys: { audioKey: string; peaksKey: string },
) {
  const discarded = await admin.rpc("discard_upload", {
    p_user: userId,
    p_object: objectId,
  });
  if (discarded.error || !discarded.data) return;
  const [audio, peaks] = await Promise.all([
    removeAudio([keys.audioKey]),
    admin.storage.from("peaks").remove([keys.peaksKey]),
  ]);
  if (!audio || peaks.error)
    console.error("Could not remove a rejected upload");
}
