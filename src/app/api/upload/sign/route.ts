import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { BodyError, databaseError, jsonError, readJson } from "@/lib/api/http";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MIME,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
} from "@/config/upload";
import { presignAudioUpload } from "@/lib/storage/r2";
import { objectKeys } from "@/lib/upload/keys";

const bodySchema = z
  .object({
    size: z.number().int().positive().max(AUDIO_MAX_BYTES),
    type: z.literal(AUDIO_MIME),
    durationMs: z.number().int().min(MIN_DURATION_MS).max(MAX_DURATION_MS),
    // Set when the upload is a new version of this track.
    trackId: z.uuid().optional(),
  })
  .strict();

// Step 1 of an upload. Validates what the browser says it is about to
// upload and returns upload URLs for the mp3 (R2) and the peaks JSON
// (Storage). Both are for `<user id>/<reserved uuid>`, and reserving fails
// when the user has no uploads left, so nobody uploads a file the database
// would then reject. The R2 URL only accepts exactly the declared size as
// audio/mpeg, once; the peaks URL is signed with the user's own session and
// the storage policy checks the reservation. /api/tracks checks the actual
// bytes before a track row exists.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  let body;
  try {
    body = bodySchema.safeParse(await readJson(request));
  } catch (error) {
    if (error instanceof BodyError)
      return jsonError(400, "invalid_body", error.message);
    throw error;
  }
  if (!body.success) {
    return jsonError(
      400,
      "invalid_upload",
      "Upload an mp3 under 25 MB and 15 minutes.",
    );
  }

  // Reserves the object id, for this user only.
  const reserved = await auth.supabase.rpc("reserve_upload", {
    p_track: body.data.trackId?.toLowerCase(),
  });
  if (reserved.error) return databaseError(reserved.error);

  const objectId = reserved.data;
  const { audioKey, peaksKey } = objectKeys(auth.user.id, objectId);

  let audioUrl: string;
  try {
    audioUrl = await presignAudioUpload(audioKey, body.data.size);
  } catch (error) {
    console.error("Could not sign audio upload", (error as Error).message);
    return jsonError(500, "sign_failed", "Could not prepare the upload.");
  }
  const peaks = await auth.supabase.storage
    .from("peaks")
    .createSignedUploadUrl(peaksKey);
  if (peaks.error) {
    console.error("Could not sign upload", peaks.error.message);
    return jsonError(500, "sign_failed", "Could not prepare the upload.");
  }

  return Response.json(
    {
      objectId,
      audio: { path: audioKey, signedUrl: audioUrl },
      peaks: {
        path: peaks.data.path,
        token: peaks.data.token,
        signedUrl: peaks.data.signedUrl,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
