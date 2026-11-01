import { AUDIO_MIME, PEAKS_MIME } from "@/config/upload";
import { supabaseAnonKey } from "@/lib/supabase/env";

// Browser side of the upload flow: reserve and sign,
// upload both objects, then register the track.

type SignedTarget = { path: string; token: string; signedUrl: string };
type AudioTarget = { path: string; signedUrl: string };
export type SignResponse = {
  objectId: string;
  audio: AudioTarget;
  peaks: SignedTarget;
};

export type TrackInput = {
  title: string;
  description: string;
  genre: string;
  tags: string[];
  feedbackWants: string[];
  level: string | null;
  durationMs: number;
  loudness: number | null;
  referenceUrl: string | null;
};

export class UploadError extends Error {
  constructor(
    readonly code:
      | "rate_limited"
      | "upload_interrupted"
      | "unauthenticated"
      | "rejected"
      | "unknown",
    readonly detail?: string,
  ) {
    super(code);
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new UploadError("upload_interrupted");
  }
  const json = (await response.json().catch(() => null)) as
    (T & { error?: { code?: string; message?: string } }) | null;
  if (response.ok && json) return json;
  const message = json?.error?.message;
  if (response.status === 429) throw new UploadError("rate_limited", message);
  if (response.status === 401) throw new UploadError("unauthenticated");
  if (response.status === 400 || response.status === 422)
    throw new UploadError("rejected", message);
  throw new UploadError("unknown");
}

/** With trackId, the upload is a new version of that track. */
export function signUpload(size: number, durationMs: number, trackId?: string) {
  return postJson<SignResponse>("/api/upload/sign", {
    size,
    type: AUDIO_MIME,
    durationMs,
    ...(trackId ? { trackId } : {}),
  });
}

export function createTrack(objectId: string, input: TrackInput) {
  return postJson<{ id: string; slug: string }>("/api/tracks", {
    objectId,
    ...input,
    ownWork: true,
  });
}

export function createVersion(
  trackId: string,
  input: {
    objectId: string;
    durationMs: number;
    loudness: number | null;
    note: string;
  },
) {
  return postJson<{ id: string; versionNo: number }>(
    `/api/tracks/${trackId}/versions`,
    input,
  );
}

// PUT with progress. `headers` must match what the URL was signed for.
function put(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers))
      xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new UploadError(
              [403, 412, 413].includes(xhr.status) ? "rejected" : "unknown",
            ),
          );
    xhr.onerror = () => reject(new UploadError("upload_interrupted"));
    xhr.onabort = () => reject(new UploadError("upload_interrupted"));
    xhr.send(body);
  });
}

// The peaks JSON, to a Storage signed upload URL. Storage checks the type
// against the bucket's allowlist and the size against its limit.
export function putPeaks(target: SignedTarget, body: Blob): Promise<void> {
  return put(target.signedUrl, body, {
    apikey: supabaseAnonKey(),
    "Content-Type": PEAKS_MIME,
    "x-upsert": "false",
  });
}

// The mp3, to a presigned R2 URL that only takes this size as audio/mpeg
// and never replaces a file that is already there.
export function putAudio(
  target: AudioTarget,
  body: Blob,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return put(
    target.signedUrl,
    body,
    { "Content-Type": AUDIO_MIME, "If-None-Match": "*" },
    onProgress,
  );
}

// "You can upload 3 tracks per day." from the rate limit trigger.
export function parseRateLimit(message: string | undefined): {
  limit: number;
  retry: string;
} {
  const match = /(\d+) tracks per (day|week)/.exec(message ?? "");
  return {
    limit: match ? Number(match[1]) : 2,
    retry: match?.[2] === "week" ? "next week" : "tomorrow",
  };
}
