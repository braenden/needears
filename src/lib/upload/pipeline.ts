import type { UploadPipeline } from "@/components/upload/upload-wizard";
import type { VersionPipeline } from "@/components/versions/new-version-dialog";
import { AUDIO_MAX_BYTES, PEAKS_MIME, PEAKS_POINTS } from "@/config/upload";
import { type Decoded, DecodeError, decodeAudio } from "@/lib/audio/decode";
import { encodeMp3 } from "@/lib/audio/encode";
import { measureLoudness } from "@/lib/audio/loudness";
import {
  computePeaks,
  displayPeaks,
  type StoredPeaks,
} from "@/lib/audio/waveform";
import {
  createTrack,
  createVersion,
  parseRateLimit,
  putAudio,
  putPeaks,
  signUpload,
  UploadError,
} from "./client";
import { parseTags } from "./tags";

function isMp3(file: File) {
  return /\.mp3$/i.test(file.name) || file.type === "audio/mpeg";
}

type PublishFailure = {
  ok: false;
  error: "upload_interrupted" | "rate_limited" | "unknown";
  rateLimit?: { limit: number; retry: string };
};

function publishFailure(error: unknown): PublishFailure {
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

/**
 * The browser work shared by a first upload and a new version. One per
 * dialog: it keeps the decoded audio, the peaks, the loudness and the mp3
 * between the steps. Encoding starts as soon as the file is analyzed.
 */
function createAudioWork() {
  let decoded: Decoded | null = null;
  let peaks: StoredPeaks | null = null;
  let loudness: number | null = null;
  let source: File | null = null;
  let mp3: Blob | null = null;

  const work = {
    async analyze(
      file: File,
      onProgress: (stage: "decoding" | "waveform", progress: number) => void,
    ): ReturnType<UploadPipeline["analyze"]> {
      decoded = null;
      peaks = null;
      loudness = null;
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
      // Measured from the decoded audio, so A/B can play versions equally loud.
      loudness = measureLoudness(decoded.channels, decoded.sampleRate);
      onProgress("waveform", 1);
      // An mp3 that fits is uploaded as it is, no re-encoding.
      if (isMp3(file) && file.size <= AUDIO_MAX_BYTES) mp3 = file;
      return {
        ok: true,
        peaks: displayPeaks(peaks),
        durationMs: decoded.durationMs,
      };
    },

    async encode(
      _file: File,
      onProgress: (progress: number) => void,
    ): Promise<boolean> {
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

    /**
     * Encodes if that has not happened yet, then signs and uploads the mp3
     * and the peaks. Null when there is nothing to upload.
     */
    async upload(
      onProgress: (progress: number) => void,
      trackId?: string,
    ): Promise<{
      objectId: string;
      durationMs: number;
      loudness: number | null;
    } | null> {
      if (!peaks || !source || !decoded) return null;
      const durationMs = decoded.durationMs;
      // The dialogs skip encode() for mp3 files; one too big to store as it
      // is gets re-encoded here instead.
      if (!mp3) {
        const ok = await work.encode(source, (p) => onProgress(p * 0.5));
        if (!ok || !mp3) return null;
      }
      const audio: Blob = mp3;
      onProgress(0.02);
      const signed = await signUpload(audio.size, durationMs, trackId);
      onProgress(0.05);
      await putPeaks(
        signed.peaks,
        new Blob([JSON.stringify(peaks)], { type: PEAKS_MIME }),
      );
      await putAudio(signed.audio, audio, (p) => onProgress(0.05 + p * 0.85));
      onProgress(0.92);
      return { objectId: signed.objectId, durationMs, loudness };
    },
  };
  return work;
}

/** The real browser pipeline behind UploadWizard. */
export function createUploadPipeline(): UploadPipeline {
  const work = createAudioWork();
  return {
    analyze: work.analyze,
    encode: work.encode,
    async publish(details, onProgress) {
      try {
        const uploaded = await work.upload(onProgress);
        if (!uploaded) return { ok: false, error: "unknown" };
        const track = await createTrack(uploaded.objectId, {
          title: details.title.trim(),
          description: details.description.trim(),
          genre: details.genre,
          tags: parseTags(details.tags),
          feedbackWants: details.feedbackWants,
          level: details.level,
          durationMs: uploaded.durationMs,
          loudness: uploaded.loudness,
          referenceUrl: details.reference.trim() || null,
        });
        onProgress(1);
        return { ok: true, slug: track.slug };
      } catch (error) {
        return publishFailure(error);
      }
    },
  };
}

/** The real browser pipeline behind NewVersionDialog. */
export function createVersionPipeline(trackId: string): VersionPipeline {
  const work = createAudioWork();
  return {
    analyze: work.analyze,
    encode: work.encode,
    async publish({ note }, onProgress) {
      try {
        const uploaded = await work.upload(onProgress, trackId);
        if (!uploaded) return { ok: false, error: "unknown" };
        const version = await createVersion(trackId, {
          objectId: uploaded.objectId,
          durationMs: uploaded.durationMs,
          loudness: uploaded.loudness,
          note: note.trim(),
        });
        onProgress(1);
        return {
          ok: true,
          version: {
            id: version.id,
            version_no: version.versionNo,
            note: note.trim() || null,
            duration_ms: uploaded.durationMs,
            created_at: new Date().toISOString(),
          },
        };
      } catch (error) {
        return publishFailure(error);
      }
    },
  };
}
