import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { BodyError, databaseError, jsonError, readJson } from "@/lib/api/http";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MIME,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
} from "@/config/upload";
import { objectKeys } from "@/lib/upload/keys";

const bodySchema = z
  .object({
    size: z.number().int().positive().max(AUDIO_MAX_BYTES),
    type: z.literal(AUDIO_MIME),
    durationMs: z.number().int().min(MIN_DURATION_MS).max(MAX_DURATION_MS),
  })
  .strict();

// Step 1 of an upload. Validates what the browser
// says it is about to upload and returns signed upload URLs for the mp3 and
// the peaks JSON. The URLs are signed with the user's own session, so the
// objects are owned by the user, and the storage policies only allow
// `<user id>/<reserved uuid>.mp3|json`. The bucket enforces the size and the
// declared MIME type; /api/tracks checks the actual bytes before a track row
// exists.
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

  // Reserves the object id. The storage policies only accept objects with a
  // valid reservation, and reserving fails when the user has no uploads
  // left, so nobody uploads a file the database would then reject.
  const reserved = await auth.supabase.rpc("reserve_upload");
  if (reserved.error) return databaseError(reserved.error);

  const objectId = reserved.data;
  const { audioKey, peaksKey } = objectKeys(auth.user.id, objectId);

  const [audio, peaks] = await Promise.all([
    auth.supabase.storage.from("audio").createSignedUploadUrl(audioKey),
    auth.supabase.storage.from("peaks").createSignedUploadUrl(peaksKey),
  ]);
  if (audio.error || peaks.error) {
    console.error(
      "Could not sign upload",
      audio.error?.message ?? peaks.error?.message,
    );
    return jsonError(500, "sign_failed", "Could not prepare the upload.");
  }

  return Response.json(
    {
      objectId,
      audio: {
        path: audio.data.path,
        token: audio.data.token,
        signedUrl: audio.data.signedUrl,
      },
      peaks: {
        path: peaks.data.path,
        token: peaks.data.token,
        signedUrl: peaks.data.signedUrl,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
