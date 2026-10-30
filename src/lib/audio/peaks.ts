import { z } from "zod";

// Waveform peaks as stored in the `peaks` bucket. The browser computes them
// while decoding the upload: one array per channel,
// each value the peak amplitude of its slice, normalized and quantized to
// 0 to 255. Divide by 255 to get the 0 to 1 range wavesurfer.js expects.

import { PEAKS_VERSION } from "./waveform";

export { PEAKS_VERSION };
export const MIN_PEAKS = 100;
export const MAX_PEAKS = 4000;

const channel = z
  .array(z.number().int().min(0).max(255))
  .min(MIN_PEAKS)
  .max(MAX_PEAKS);

export const peaksSchema = z
  .object({
    version: z.literal(PEAKS_VERSION),
    channels: z.array(channel).min(1).max(2),
  })
  .strict()
  .refine((p) => p.channels.every((c) => c.length === p.channels[0]!.length), {
    message: "All channels must have the same length",
  });
