// Generates the short mp3 files and peaks used by supabase/seed.sql.
// Needs ffmpeg with libmp3lame. The output is committed, so this only has
// to run again if the list below changes:
//
//   node scripts/generate-seed-audio.mjs
//
// Files land in supabase/seed-storage/{audio,peaks}/<owner id>/<uuid>.*,
// which supabase/config.toml uploads to the buckets on `supabase start`
// and `supabase db reset`.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(
  new URL("../supabase/seed-storage/", import.meta.url),
);

const NORA = "a0000000-0000-4000-8000-000000000001";
const JONAS = "a0000000-0000-4000-8000-000000000002";
const MIA = "a0000000-0000-4000-8000-000000000003";

// [object uuid, owner, seconds, root frequency, beats per minute]
// Keep in sync with the tracks in supabase/seed.sql.
const tracks = [
  ["c0000000-0000-4000-8000-000000000001", NORA, 24, 220.0, 84],
  ["c0000000-0000-4000-8000-000000000002", NORA, 18, 261.63, 120],
  ["c0000000-0000-4000-8000-000000000003", NORA, 30, 196.0, 70],
  ["c0000000-0000-4000-8000-000000000004", JONAS, 20, 146.83, 128],
  ["c0000000-0000-4000-8000-000000000005", JONAS, 26, 174.61, 92],
  ["c0000000-0000-4000-8000-000000000006", JONAS, 16, 329.63, 140],
  ["c0000000-0000-4000-8000-000000000007", MIA, 28, 110.0, 100],
  ["c0000000-0000-4000-8000-000000000008", MIA, 22, 246.94, 76],
  ["c0000000-0000-4000-8000-000000000009", MIA, 19, 293.66, 110],
  ["c0000000-0000-4000-8000-000000000010", MIA, 25, 164.81, 88],
];

const POINTS = 2000;

rmSync(root, { recursive: true, force: true });

for (const [id, owner, seconds, f, bpm] of tracks) {
  const audioDir = `${root}audio/${owner}`;
  const peaksDir = `${root}peaks/${owner}`;
  mkdirSync(audioDir, { recursive: true });
  mkdirSync(peaksDir, { recursive: true });

  // A root, fifth and octave, pulsing at the tempo, with a slow fade in/out.
  const beat = bpm / 60;
  const expr = [
    `(0.35*sin(2*PI*${f}*t)+0.2*sin(2*PI*${f * 1.5}*t)+0.12*sin(2*PI*${f * 2}*t))`,
    `*(0.55+0.45*sin(2*PI*${beat}*t))`,
    `*min(1,t/2)*min(1,(${seconds}-t)/2)`,
  ].join("");

  const mp3 = `${audioDir}/${id}.mp3`;
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `aevalsrc=exprs='${expr}':s=22050:d=${seconds}`,
    "-ac",
    "1",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "32k",
    "-write_xing",
    "0",
    "-map_metadata",
    "-1",
    mp3,
  ]);

  const pcm = execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      mp3,
      "-f",
      "s16le",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const samples = new Int16Array(
    pcm.buffer,
    pcm.byteOffset,
    Math.floor(pcm.length / 2),
  );
  const size = samples.length / POINTS;
  const raw = [];
  for (let i = 0; i < POINTS; i++) {
    let peak = 0;
    for (let j = Math.floor(i * size); j < Math.floor((i + 1) * size); j++) {
      peak = Math.max(peak, Math.abs(samples[j]));
    }
    raw.push(peak);
  }
  const max = Math.max(...raw, 1);
  const peaks = {
    version: 1,
    channels: [raw.map((p) => Math.round((p / max) * 255))],
  };
  writeFileSync(`${peaksDir}/${id}.json`, JSON.stringify(peaks));
  console.log(`${owner}/${id}  ${seconds}s`);
}
