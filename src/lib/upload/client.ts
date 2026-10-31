import { AUDIO_MIME, PEAKS_MIME } from "@/config/upload";
import { supabaseAnonKey } from "@/lib/supabase/env";

// Browser side of the upload flow: reserve and sign,
// upload both objects, then register the track.

type SignedTarget = { path: string; token: string; signedUrl: string };
export type SignResponse = {
  objectId: string;
  audio: SignedTarget;
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

// PUT to a signed upload URL with progress. Storage checks the declared
// type against the bucket's allowlist and the size against its limit.
export function putSigned(
  target: SignedTarget,
  body: Blob,
  contentType: typeof AUDIO_MIME | typeof PEAKS_MIME,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.signedUrl);
    xhr.setRequestHeader("apikey", supabaseAnonKey());
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new UploadError(xhr.status === 413 ? "rejected" : "unknown"));
    xhr.onerror = () => reject(new UploadError("upload_interrupted"));
    xhr.onabort = () => reject(new UploadError("upload_interrupted"));
    xhr.send(body);
  });
}

// "You can upload 2 tracks per day." from the rate limit trigger.
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
