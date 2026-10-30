// Waveform math shared by the browser pipeline and the pages. Kept apart
// from peaks.ts so client bundles do not pull in zod (its JIT probe trips
// the CSP).

export const PEAKS_VERSION = 1;

// The stored format, validated by peaksSchema in peaks.ts.
export type StoredPeaks = {
  version: typeof PEAKS_VERSION;
  channels: number[][];
};

// Computes stored peaks from decoded audio: `points` slices per channel,
// the absolute peak of each slice, scaled so the loudest slice of the whole
// file is 255. Quiet tracks still get a readable waveform.
export function computePeaks(
  channels: Float32Array[],
  points: number,
): StoredPeaks {
  const length = channels[0]?.length ?? 0;
  const raw = channels.map((data) => {
    const out = new Float32Array(points);
    const size = length / points;
    for (let i = 0; i < points; i++) {
      const start = Math.floor(i * size);
      const end = Math.max(start + 1, Math.floor((i + 1) * size));
      let max = 0;
      for (let j = start; j < end && j < length; j++) {
        const v = Math.abs(data[j]!);
        if (v > max) max = v;
      }
      out[i] = max;
    }
    return out;
  });
  let loudest = 0;
  for (const channel of raw)
    for (const v of channel) if (v > loudest) loudest = v;
  const scale = loudest > 0 ? 255 / loudest : 0;
  return {
    version: PEAKS_VERSION,
    channels: raw.map((channel) =>
      Array.from(channel, (v) => Math.min(255, Math.round(v * scale))),
    ),
  };
}

// Stored peaks to one 0 to 1 array for display: the louder channel at each
// point.
export function displayPeaks(peaks: StoredPeaks): number[] {
  const [first, ...rest] = peaks.channels;
  if (!first) return [];
  return first.map((v, i) => {
    let max = v;
    for (const channel of rest) max = Math.max(max, channel[i] ?? 0);
    return max / 255;
  });
}

// Max over buckets, so short peaks in a bucket are not lost.
export function downsample(peaks: number[], bars: number): number[] {
  if (peaks.length === 0) return Array.from({ length: bars }, () => 0);
  const size = peaks.length / bars;
  return Array.from({ length: bars }, (_, i) => {
    let max = 0;
    const end = Math.min(peaks.length, Math.ceil((i + 1) * size));
    for (let j = Math.floor(i * size); j < end; j++)
      max = Math.max(max, peaks[j] ?? 0);
    return max;
  });
}
