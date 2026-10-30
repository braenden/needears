import "server-only";
import { inspectMp3 } from "@/lib/audio/mp3";
import { peaksSchema } from "@/lib/audio/peaks";
import type { createAdminClient } from "@/lib/supabase/admin";
import { objectUrl } from "@/lib/supabase/env";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MIME,
  durationTolerance,
  MAX_DURATION_MS,
  PEAKS_MAX_BYTES,
  PEAKS_MIME,
} from "@/config/upload";

type Admin = ReturnType<typeof createAdminClient>;

export type VerifyResult =
  { ok: true } | { ok: false; code: string; message: string };

const HEAD_BYTES = 64 * 1024;

// Checks the uploaded objects before a track row is created: both exist,
// sizes and types are within limits, the audio really is an mp3 (magic
// bytes, not the file name) with roughly the declared duration, and the
// peaks file is valid JSON in our format.
export async function verifyUpload(
  admin: Admin,
  keys: { audioKey: string; peaksKey: string },
  declaredDurationMs: number,
): Promise<VerifyResult> {
  const [audioInfo, peaksInfo] = await Promise.all([
    admin.storage.from("audio").info(keys.audioKey),
    admin.storage.from("peaks").info(keys.peaksKey),
  ]);
  if (audioInfo.error || !audioInfo.data) {
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

  const audioSize = audioInfo.data.size ?? 0;
  if (
    audioSize <= 0 ||
    audioSize > AUDIO_MAX_BYTES ||
    audioInfo.data.contentType !== AUDIO_MIME
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

  const bytes = await readHead(keys.audioKey, Math.min(audioSize, HEAD_BYTES));
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

  return { ok: true };
}

// The first `length` bytes of an audio object, or null on any error. The
// bucket is private, so this reads with the service role. supabase-js has no
// range download, hence the plain fetch.
async function readHead(
  key: string,
  length: number,
): Promise<Uint8Array | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  try {
    const response = await fetch(objectUrl("audio", key), {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        Range: `bytes=0-${length - 1}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer()).subarray(0, length);
  } catch {
    return null;
  }
}
