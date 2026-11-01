// Copies the audio of every track version from the Supabase Storage audio
// bucket to the R2 bucket, under the same keys. Run once before the switch
// to R2 is deployed. Safe to run again: files already in R2 with the same
// size are skipped. Nothing is ever deleted or replaced, in Storage or R2.
//
//   node --env-file=<file> scripts/copy-audio-to-r2.mjs --dry-run
//   node --env-file=<file> scripts/copy-audio-to-r2.mjs
//
// The file holds SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ENDPOINT,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET. Keep it outside the
// repository. --dry-run only lists what would be copied.
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

function setting(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(
  setting("SUPABASE_URL"),
  setting("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const bucket = setting("R2_BUCKET");
const s3 = new S3Client({
  endpoint: setting("R2_ENDPOINT"),
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: setting("R2_ACCESS_KEY_ID"),
    secretAccessKey: setting("R2_SECRET_ACCESS_KEY"),
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

async function sizeInR2(key) {
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return head.ContentLength ?? 0;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

// Every audio key in use, page by page.
const keys = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("track_versions")
    .select("audio_key")
    .order("audio_key")
    .range(from, from + 999);
  if (error) {
    console.error("Could not read track_versions:", error.message);
    process.exit(1);
  }
  keys.push(...data.map((row) => row.audio_key));
  if (data.length < 1000) break;
}
console.log(`${keys.length} audio files in use`);

let copied = 0;
let skipped = 0;
let failed = 0;
for (const key of [...new Set(keys)]) {
  try {
    const info = await supabase.storage.from("audio").info(key);
    if (info.error || !info.data) {
      console.error(`missing in Storage: ${key}`);
      failed++;
      continue;
    }
    const size = info.data.size ?? 0;
    const existing = await sizeInR2(key);
    if (existing === size) {
      console.log(`already in R2: ${key}`);
      skipped++;
      continue;
    }
    if (existing !== null) {
      console.error(
        `in R2 with another size (${existing} bytes), left alone: ${key}`,
      );
      failed++;
      continue;
    }
    if (dryRun) {
      console.log(`would copy: ${key} (${size} bytes)`);
      continue;
    }
    const file = await supabase.storage.from("audio").download(key);
    if (file.error) throw new Error(file.error.message);
    const body = new Uint8Array(await file.data.arrayBuffer());
    // Never replaces anything: R2 refuses the PUT if the key exists.
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "audio/mpeg",
        ContentLength: body.length,
        IfNoneMatch: "*",
      }),
    );
    if ((await sizeInR2(key)) !== body.length) {
      console.error(`copied but the size in R2 differs: ${key}`);
      failed++;
      continue;
    }
    console.log(`copied: ${key} (${body.length} bytes)`);
    copied++;
  } catch (error) {
    console.error(`failed: ${key}: ${error?.message ?? error}`);
    failed++;
  }
}

console.log(
  `${dryRun ? "Dry run: " : ""}${copied} copied, ${skipped} already there, ${failed} problems`,
);
process.exit(failed > 0 ? 1 : 0);
