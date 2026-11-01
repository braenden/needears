import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AUDIO_MAX_BYTES, AUDIO_MIME } from "@/config/upload";

// Audio lives in a private Cloudflare R2 bucket, reached with the S3 API.
// Locally and in CI the same code talks to an S3 compatible stand-in
// (scripts/local-r2.mjs). The credentials never leave the server: browsers
// only get presigned URLs for one object and one method.
//
// Keys are always `<user id>/<uuid>.mp3`, built by src/lib/upload/keys.ts
// or read from the database, never taken from a request.

// How long a presigned upload URL works. The browser starts the upload
// right after it gets the URL; a retry signs a new one.
const UPLOAD_URL_SECONDS = 15 * 60;

const AUDIO_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/;
const USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FOLDER_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/;

function setting(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let cached: { client: S3Client; bucket: string } | null = null;

function r2() {
  if (cached) return cached;
  const client = new S3Client({
    endpoint: setting("R2_ENDPOINT"),
    region: "auto",
    // Path style keeps every URL on the endpoint's origin, which is the one
    // origin the CSP allows (src/lib/security/csp.ts).
    forcePathStyle: true,
    credentials: {
      accessKeyId: setting("R2_ACCESS_KEY_ID"),
      secretAccessKey: setting("R2_SECRET_ACCESS_KEY"),
    },
    // R2 does not need the SDK's default checksums, and a checksum header
    // in a presigned URL would have to be sent by the browser too.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  cached = { client, bucket: setting("R2_BUCKET") };
  return cached;
}

export function isAudioKey(key: string): boolean {
  return AUDIO_KEY.test(key);
}

function assertKey(key: string) {
  if (!isAudioKey(key)) throw new Error("Invalid audio key");
}

// A URL the browser can PUT exactly one new mp3 to: this key, this size and
// audio/mpeg, and only if nothing is stored there yet. The size, the type
// and If-None-Match are signed, so a request with anything else is refused
// (putAudio in src/lib/upload/client.ts sends them; the browser sets
// Content-Length from the body).
export async function presignAudioUpload(
  key: string,
  size: number,
): Promise<string> {
  assertKey(key);
  if (!Number.isInteger(size) || size <= 0 || size > AUDIO_MAX_BYTES)
    throw new Error("Invalid audio size");
  const { client, bucket } = r2();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: AUDIO_MIME,
      ContentLength: size,
      IfNoneMatch: "*",
    }),
    {
      expiresIn: UPLOAD_URL_SECONDS,
      signableHeaders: new Set([
        "content-type",
        "content-length",
        "if-none-match",
      ]),
    },
  );
}

// A URL to play one mp3. Callers decide who may hear it
// (signAudio in src/lib/data/media.ts).
export async function presignAudioPlayback(
  key: string,
  seconds: number,
): Promise<string> {
  assertKey(key);
  const { client, bucket } = r2();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    {
      expiresIn: seconds,
    },
  );
}

function isNotFound(error: unknown): boolean {
  return (
    (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode === 404
  );
}

// Size and type of a stored mp3, or null when there is none. Throws when R2
// cannot be reached, so callers never mistake an outage for a missing file.
export async function audioInfo(
  key: string,
): Promise<{ size: number; contentType: string | null } | null> {
  assertKey(key);
  const { client, bucket } = r2();
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      size: head.ContentLength ?? 0,
      contentType: head.ContentType ?? null,
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

// The first `length` bytes of a stored mp3, or null when there is none.
// Throws when R2 cannot be reached.
export async function readAudioStart(
  key: string,
  length: number,
): Promise<Uint8Array | null> {
  assertKey(key);
  const { client, bucket } = r2();
  try {
    const object = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=0-${length - 1}`,
      }),
    );
    if (!object.Body) return null;
    return (await object.Body.transformToByteArray()).subarray(0, length);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

// Removes objects in users' folders (`<user id>/<name>`), ten at a time.
// Missing keys count as removed. False when a key is not in a user's
// folder or R2 refused. One request per object, since a batch delete needs
// a checksum header that S3 compatible stores do not all take.
export async function removeAudio(keys: string[]): Promise<boolean> {
  const unique = [...new Set(keys)];
  if (!unique.every((key) => FOLDER_KEY.test(key))) return false;
  const { client, bucket } = r2();
  for (let i = 0; i < unique.length; i += 10) {
    try {
      await Promise.all(
        unique
          .slice(i, i + 10)
          .map((Key) =>
            client.send(new DeleteObjectCommand({ Bucket: bucket, Key })),
          ),
      );
    } catch {
      return false;
    }
  }
  return true;
}

export type StoredAudio = { key: string; lastModified: Date };

// One page (up to 1000) of stored objects in key order, under a user's
// folder when `userId` is given, or after `startAfter`. `next` continues
// the listing; null at the end.
export async function listAudio(options: {
  userId?: string;
  startAfter?: string;
  next?: string | null;
}): Promise<{ objects: StoredAudio[]; next: string | null } | null> {
  if (options.userId !== undefined && !USER_ID.test(options.userId))
    throw new Error("Invalid user id");
  const { client, bucket } = r2();
  try {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: options.userId ? `${options.userId}/` : undefined,
        StartAfter: options.startAfter,
        ContinuationToken: options.next ?? undefined,
        MaxKeys: 1000,
      }),
    );
    const objects = (page.Contents ?? []).flatMap((o) =>
      o.Key && o.LastModified
        ? [{ key: o.Key, lastModified: o.LastModified }]
        : [],
    );
    return {
      objects,
      next: page.IsTruncated ? (page.NextContinuationToken ?? null) : null,
    };
  } catch {
    return null;
  }
}
