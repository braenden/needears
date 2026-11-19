import "server-only";
import { removeAudio } from "@/lib/storage/r2";
import type { createAdminClient } from "@/lib/supabase/admin";

type Service = ReturnType<typeof createAdminClient>;

/**
 * Removes the audio and peaks of deleted tracks' versions. Audio is in R2;
 * tracks from before the move also have a copy in the old Storage bucket.
 * True when everything went. What is left, the daily clean up takes.
 */
export async function removeTrackFiles(
  service: Service,
  files: { audio_key: string; peaks_key: string }[],
): Promise<boolean> {
  if (files.length === 0) return true;
  const audioKeys = [...new Set(files.map((f) => f.audio_key))];
  const peaksKeys = [...new Set(files.map((f) => f.peaks_key))];
  const [audio, legacyAudio, peaks] = await Promise.all([
    removeAudio(audioKeys),
    service.storage.from("audio").remove(audioKeys),
    service.storage.from("peaks").remove(peaksKeys),
  ]);
  return audio && !legacyAudio.error && !peaks.error;
}
