// Upload limits, in one place. The peaks bucket limit in the storage
// migration and in supabase/config.toml must match PEAKS_MAX_BYTES; the
// audio size is pinned in each presigned R2 upload (src/lib/storage/r2.ts).
// Only mp3 is stored; the browser encodes wav, aiff and flac before upload.

// What the browser accepts from the person.
export const INPUT_MAX_BYTES = 150 * 1024 * 1024;
// Phones run out of memory decoding big files.
export const INPUT_MOBILE_MAX_BYTES = 50 * 1024 * 1024;
export const INPUT_EXTENSIONS = ["mp3", "wav", "aiff", "aif", "flac"];

// What is stored.
export const AUDIO_MIME = "audio/mpeg";
// 15 minutes at 192 kbps is about 21.6 MB.
export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export const ENCODE_KBPS = 192;
export const PEAKS_MIME = "application/json";
export const PEAKS_MAX_BYTES = 256 * 1024;
// Points per channel in the stored peaks (src/lib/audio/peaks.ts).
export const PEAKS_POINTS = 2000;

export const MIN_DURATION_MS = 1000;
export const MAX_DURATION_MS = 15 * 60 * 1000;

// How far the duration measured from the file may be from the declared one.
export function durationTolerance(declaredMs: number): number {
  return Math.max(2000, declaredMs * 0.05);
}
