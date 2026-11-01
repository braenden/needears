// Local stand-in for the Cloudflare R2 audio bucket: RustFS, an S3
// compatible server, in Docker on port 54430. Starts it if needed, creates
// the bucket and uploads the seed audio from supabase/seed-storage/audio,
// so local tracks and the CI e2e tests can play. The bucket gets the same
// CORS rule as production, for the local origins (the e2e tests also use
// port 3001).
//
//   pnpm r2:start
//
// Uses R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET
// from the environment, or the local defaults in .env.example. Refuses to
// run against anything but localhost.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const IMAGE =
  "rustfs/rustfs:1.0.4@sha256:ed9210d6411d77ffceb70d94b964a3cb7d225983368bc25bebe01e995293dcc2";
const CONTAINER = "needears-r2";

const endpoint = process.env.R2_ENDPOINT ?? "http://127.0.0.1:54430";
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "needears-local";
const secretAccessKey =
  process.env.R2_SECRET_ACCESS_KEY ?? "needears-local-secret";
const bucket = process.env.R2_BUCKET ?? "needears-audio";

const url = new URL(endpoint);
if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
  console.error(`Not a local endpoint: ${endpoint}`);
  process.exit(1);
}

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

const running = docker(
  "ps",
  "--filter",
  `name=^${CONTAINER}$`,
  "--format",
  "{{.Names}}",
);
if (running !== CONTAINER) {
  // A stopped container from an earlier run.
  try {
    docker("rm", "--force", CONTAINER);
  } catch {
    // None there.
  }
  docker(
    "run",
    "--detach",
    "--name",
    CONTAINER,
    "--publish",
    `127.0.0.1:${url.port || "80"}:9000`,
    "--env",
    `RUSTFS_ACCESS_KEY=${accessKeyId}`,
    "--env",
    `RUSTFS_SECRET_KEY=${secretAccessKey}`,
    IMAGE,
    "/data",
  );
  console.log(`Started ${CONTAINER} on ${endpoint}`);
}

const s3 = new S3Client({
  endpoint,
  region: "auto",
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// Wait until the server answers.
for (let attempt = 0; ; attempt++) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    break;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404) {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`Created bucket ${bucket}`);
      break;
    }
    if (attempt >= 30) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// Browsers upload with PUT and the player may read with GET. Keep in step
// with the rule on the R2 bucket.
await s3.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ["http://localhost:3000", "http://localhost:3001"],
          AllowedMethods: ["GET", "PUT"],
          AllowedHeaders: ["content-type", "if-none-match"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);

const seedDir = join(
  import.meta.dirname,
  "..",
  "supabase",
  "seed-storage",
  "audio",
);
let uploaded = 0;
for (const user of readdirSync(seedDir)) {
  for (const file of readdirSync(join(seedDir, user))) {
    if (!file.endsWith(".mp3")) continue;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${user}/${file}`,
        Body: readFileSync(join(seedDir, user, file)),
        ContentType: "audio/mpeg",
      }),
    );
    uploaded++;
  }
}
console.log(`Uploaded ${uploaded} seed files to ${bucket}`);
