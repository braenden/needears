import type { UploadPipeline } from "@/components/upload/upload-wizard";
import { TAG_PATTERN, TAGS_MAX } from "@/config/limits";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MIME,
  PEAKS_MIME,
  PEAKS_POINTS,
} from "@/config/upload";
import { type Decoded, DecodeError, decodeAudio } from "@/lib/audio/decode";
import { encodeMp3 } from "@/lib/audio/encode";
import {
  computePeaks,
  displayPeaks,
  type StoredPeaks,
} from "@/lib/audio/waveform";
import {
  createTrack,
  parseRateLimit,
  putSigned,
  signUpload,
  UploadError,
} from "./client";

// "Deep House, lo-fi,, " -> ["deep house", "lo-fi"]; anything the database
// would refuse is dropped rather than failing the whole upload.
export function parseTags(value: string): string[] {
  const tags = value
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, " "))
    .filter((t) => TAG_PATTERN.test(t));
  return [...new Set(tags)].slice(0, TAGS_MAX);
}

function isMp3(file: File) {
  return /\.mp3$/i.test(file.name) || file.type === "audio/mpeg";
}

/**
 * The real browser pipeline behind UploadWizard. One
 * per wizard: it keeps the decoded audio, the peaks and the mp3 between the
 * steps. Encoding starts as soon as the file is analyzed, while the person
 * fills in the form.
 */
export function createUploadPipeline(): UploadPipeline {
  let decoded: Decoded | null = null;
  let peaks: StoredPeaks | null = null;
  let source: File | null = null;
  let mp3: Blob | null = null;

  return {
    async analyze(file, onProgress) {
      decoded = null;
      peaks = null;
      mp3 = null;
      source = file;
      onProgress("decoding", 0.1);
      try {
        decoded = await decodeAudio(file);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof DecodeError ? error.reason : "decode_failed",
        };
      }
      onProgress("waveform", 0.5);
      peaks = computePeaks(decoded.channels, PEAKS_POINTS);
      onProgress("waveform", 1);
      // An mp3 that fits is uploaded as it is, no re-encoding.
      if (isMp3(file) && file.size <= AUDIO_MAX_BYTES) mp3 = file;
      return {
        ok: true,
        peaks: displayPeaks(peaks),
        durationMs: decoded.durationMs,
      };
    },

    async encode(_file, onProgress) {
      if (mp3) return true;
      if (!decoded) return false;
      try {
        mp3 = await encodeMp3(decoded, onProgress);
        // The PCM is only needed for encoding; let it go.
        decoded = { ...decoded, channels: [] };
        return mp3.size <= AUDIO_MAX_BYTES;
      } catch {
        return false;
      }
    },

    async publish(details, onProgress) {
      if (!peaks || !source || !decoded) return { ok: false, error: "unknown" };
      const durationMs = decoded.durationMs;
      // The wizard skips encode() for mp3 files; one too big to store as it
      // is gets re-encoded here instead.
      if (!mp3) {
        const ok = await this.encode(source, (p) => onProgress(p * 0.5));
        if (!ok || !mp3) return { ok: false, error: "unknown" };
      }
      const audio: Blob = mp3;
      try {
        onProgress(0.02);
        const signed = await signUpload(audio.size, durationMs);
        onProgress(0.05);
        await putSigned(
          signed.peaks,
          new Blob([JSON.stringify(peaks)], { type: PEAKS_MIME }),
          PEAKS_MIME,
        );
        await putSigned(signed.audio, audio, AUDIO_MIME, (p) =>
          onProgress(0.05 + p * 0.85),
        );
        onProgress(0.92);
        const track = await createTrack(signed.objectId, {
          title: details.title.trim(),
          description: details.description.trim(),
          genre: details.genre,
          tags: parseTags(details.tags),
          feedbackWants: details.feedbackWants,
          level: details.level,
          durationMs,
        });
        onProgress(1);
        return { ok: true, slug: track.slug };
      } catch (error) {
        if (error instanceof UploadError) {
          if (error.code === "rate_limited")
            return {
              ok: false,
              error: "rate_limited",
              rateLimit: parseRateLimit(error.detail),
            };
          if (error.code === "upload_interrupted")
            return { ok: false, error: "upload_interrupted" };
        }
        return { ok: false, error: "unknown" };
      }
    },
  };
}
