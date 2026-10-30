import type { UploadPipeline } from "@/components/upload/upload-wizard";

import { mockPeaks } from "./peaks";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick(
  total: number,
  steps: number,
  onProgress: (p: number) => void,
) {
  for (let i = 1; i <= steps; i++) {
    await wait(total / steps);
    onProgress(i / steps);
  }
}

/**
 * Pretends to do the browser work with timers. File names steer the outcome
 * so every path can be tried on /design:
 *   "broken" in the name -> decoding fails
 *   "long" -> 16 minutes, too long
 *   "encodefail" -> encoding fails
 *   "offline" -> upload is interrupted
 *   "limit" -> rate limited
 */
export function createMockPipeline({ speed = 1 } = {}): UploadPipeline {
  let name = "";
  return {
    async analyze(file, onProgress) {
      name = file.name.toLowerCase();
      await tick(900 / speed, 6, (p) => onProgress("decoding", p));
      if (name.includes("broken")) return { ok: false, error: "decode_failed" };
      await tick(600 / speed, 4, (p) => onProgress("waveform", p));
      const durationMs = name.includes("long") ? 16 * 60_000 + 12_000 : 214_000;
      return { ok: true, peaks: mockPeaks(name.length + 5), durationMs };
    },
    async encode(_file, onProgress) {
      await tick(6000 / speed, 30, onProgress);
      return !name.includes("encodefail");
    },
    async publish(_details, onProgress) {
      if (name.includes("limit")) {
        await wait(400 / speed);
        return {
          ok: false,
          error: "rate_limited",
          rateLimit: { limit: 2, retry: "tomorrow" },
        };
      }
      await tick(1800 / speed, 12, (p) => {
        if (!(name.includes("offline") && p > 0.6)) onProgress(p);
      });
      if (name.includes("offline"))
        return { ok: false, error: "upload_interrupted" };
      return { ok: true, slug: "k3x9-night-bus" };
    },
  };
}
