import "server-only";
import { inspectMp3 } from "@/lib/audio/mp3";
import { peaksSchema } from "@/lib/audio/peaks";
import { audioInfo, readAudioStart } from "@/lib/storage/r2";
import type { createAdminClient } from "@/lib/supabase/admin";
import { objectKeys } from "./keys";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MIME,
  durationTolerance,
  MAX_DURATION_MS,
  PEAKS_MAX_BYTES,
  PEAKS_MIME,
} from "@/config/upload";

type Admin = ReturnType<typeof createAdminClient>;

// `retry` means the check could not run (R2 did not answer): the upload may
// be fine, so the caller keeps the files and the browser can try again.
export type VerifyResult =
  { ok: true } | { ok: false; code: string; message: string; retry?: true };

const HEAD_BYTES = 64 * 1024;

// Checks the uploaded objects before a track row is created: both exist,
// sizes and types are within limits, the audio really is an mp3 (magic
// bytes, not the file name) with roughly the declared duration, and the
// peaks file is valid JSON in our format. The audio is in R2 and the peaks
// in Storage. When everything holds, the reservation is marked verified,
// which the database requires before a track or version may use the audio.
export async function verifyUpload(
  admin: Admin,
  upload: { userId: string; objectId: string },
  declaredDurationMs: number,
): Promise<VerifyResult> {
  try {
    return await checkUpload(admin, upload, declaredDurationMs);
  } catch (error) {
    console.error("Could not check upload", (error as Error).message);
    return {
      ok: false,
      code: "check_failed",
      message: "Could not check the upload. Try again in a minute.",
      retry: true,
    };
  }
}

async function checkUpload(
  admin: Admin,
  upload: { userId: string; objectId: string },
  declaredDurationMs: number,
): Promise<VerifyResult> {
  const keys = objectKeys(upload.userId, upload.objectId);
  const [audio, peaksInfo] = await Promise.all([
    audioInfo(keys.audioKey),
    admin.storage.from("peaks").info(keys.peaksKey),
  ]);
  if (!audio) {
    return {
      ok: false,
      code: "audio_missing",
      message: "Upload the audio file first.",
    };
  }
  if (peaksInfo.error || !peaksInfo.data) {
    return {
      ok: false,
      code: "peaks_missing",
      message: "Upload the waveform first.",
    };
  }

  const audioSize = audio.size;
  if (
    audioSize <= 0 ||
    audioSize > AUDIO_MAX_BYTES ||
    audio.contentType !== AUDIO_MIME
  ) {
    return {
      ok: false,
      code: "invalid_audio",
      message: "The audio must be an mp3 under 25 MB.",
    };
  }
  const peaksSize = peaksInfo.data.size ?? 0;
  if (
    peaksSize <= 0 ||
    peaksSize > PEAKS_MAX_BYTES ||
    peaksInfo.data.contentType !== PEAKS_MIME
  ) {
    return {
      ok: false,
      code: "invalid_peaks",
      message: "The waveform file is not valid.",
    };
  }

  const bytes = await readAudioStart(
    keys.audioKey,
    Math.min(audioSize, HEAD_BYTES),
  );
  const mp3 = bytes ? inspectMp3(bytes, audioSize) : null;
  if (!mp3) {
    return {
      ok: false,
      code: "invalid_audio",
      message: "The audio file is not an mp3.",
    };
  }
  if (
    mp3.durationMs > MAX_DURATION_MS + durationTolerance(MAX_DURATION_MS) ||
    Math.abs(mp3.durationMs - declaredDurationMs) >
      durationTolerance(declaredDurationMs)
  ) {
    return {
      ok: false,
      code: "duration_mismatch",
      message: "The audio length does not match the declared duration.",
    };
  }

  const peaksFile = await admin.storage.from("peaks").download(keys.peaksKey);
  if (peaksFile.error || peaksFile.data.size > PEAKS_MAX_BYTES) {
    return {
      ok: false,
      code: "invalid_peaks",
      message: "The waveform file is not valid.",
    };
  }
  let peaksJson: unknown;
  try {
    peaksJson = JSON.parse(await peaksFile.data.text());
  } catch {
    peaksJson = null;
  }
  if (!peaksSchema.safeParse(peaksJson).success) {
    return {
      ok: false,
      code: "invalid_peaks",
      message: "The waveform file is not valid.",
    };
  }

  const marked = await admin.rpc("mark_upload_verified", {
    p_user: upload.userId,
    p_object: upload.objectId,
  });
  if (marked.error || !marked.data) {
    return {
      ok: false,
      code: "upload_expired",
      message: "Upload the file again.",
    };
  }

  return { ok: true };
}
