import { randomUUID } from "node:crypto";
import { isCronRequest } from "@/lib/api/cron";
import { jsonError } from "@/lib/api/http";
import { isAudioKey, listAudio, removeAudio } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

// Uploads younger than this are left alone: an upload URL works for 15
// minutes and a reservation for two hours.
const AUDIO_GRACE_MS = 3 * 60 * 60 * 1000;

// Removes uploaded files that nothing uses: abandoned or rejected uploads,
// and anything uploaded later with an old signed URL. Audio is listed from
// R2 and the database says which keys are unused
// (public.unused_audio_keys); for peaks, avatars and the old audio bucket
// in Storage it decides from storage.objects
// (public.orphaned_upload_objects). Run daily by Vercel Cron (vercel.json),
// which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  if (!isCronRequest(request))
    return jsonError(401, "unauthorized", "Not allowed.");

  const admin = createAdminClient();
  let removed = 0;

  for (let round = 0; round < 20; round++) {
    const orphans = await admin.rpc("orphaned_upload_objects", {
      p_limit: 100,
    });
    if (orphans.error)
      return jsonError(500, "cleanup_failed", "Could not list files.");
    if (orphans.data.length === 0) break;

    for (const bucket of ["audio", "peaks", "avatars"] as const) {
      const names = orphans.data
        .filter((o) => o.bucket_id === bucket)
        .map((o) => o.name);
      if (names.length === 0) continue;
      const result = await admin.storage.from(bucket).remove(names);
      if (result.error)
        return jsonError(500, "cleanup_failed", "Could not remove files.");
    }
    removed += orphans.data.length;
  }

  const audio = await removeUnusedAudio(admin);
  if (audio === null)
    return jsonError(500, "cleanup_failed", "Could not clean up audio.");
  removed += audio;

  const forgotten = await admin.rpc("forget_expired_upload_reservations");
  if (forgotten.error)
    return jsonError(500, "cleanup_failed", "Could not update reservations.");

  return Response.json(
    { removed },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Pages of 1000 keys one run may look at, so a run stays short.
const AUDIO_PAGES_MAX = 20;

// Lists the R2 bucket and removes audio older than the grace period that
// the database says nothing uses. Each run starts at a random point in the
// key space (keys start with a user id) and wraps around, so every key is
// reached over a few runs however large the bucket grows. Null on any
// error, so a failed lookup never removes anything.
async function removeUnusedAudio(
  admin: ReturnType<typeof createAdminClient>,
): Promise<number | null> {
  const cutoff = Date.now() - AUDIO_GRACE_MS;
  const start = randomUUID();
  let removed = 0;
  let pages = 0;
  // After the start point, then from the beginning up to it.
  for (const wrapped of [false, true]) {
    let next: string | null = null;
    do {
      if (pages++ >= AUDIO_PAGES_MAX) return removed;
      const page = await listAudio({
        startAfter: wrapped ? undefined : start,
        next,
      });
      if (!page) return null;
      const inRange = wrapped
        ? page.objects.filter((o) => o.key <= start)
        : page.objects;
      const old = inRange
        .filter((o) => o.lastModified.getTime() < cutoff && isAudioKey(o.key))
        .map((o) => o.key);
      if (old.length > 0) {
        const unused = await admin.rpc("unused_audio_keys", { p_keys: old });
        if (unused.error) return null;
        if (unused.data.length > 0) {
          if (!(await removeAudio(unused.data))) return null;
          removed += unused.data.length;
        }
      }
      if (wrapped && inRange.length < page.objects.length) break;
      next = page.next;
    } while (next);
  }
  return removed;
}
