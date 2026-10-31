import { LOUDNESS_MAX, LOUDNESS_MIN } from "@/config/versions";

// Blocks of 400 ms, like the momentary window in loudness meters.
const BLOCK_SECONDS = 0.4;
// Blocks quieter than this are silence (intros, gaps, tails) and left out,
// so a long quiet ending does not make a track measure quieter than it plays.
const GATE_DB = -70;

const toDb = (power: number) => 10 * Math.log10(power);

/**
 * Integrated loudness of decoded audio, as gated RMS in dBFS. Not a full
 * LUFS meter (no K weighting), but close enough to level match two versions
 * of the same track, which is all it is used for. Null for pure silence.
 */
export function measureLoudness(
  channels: Float32Array[],
  sampleRate: number,
): number | null {
  const frames = channels[0]?.length ?? 0;
  const block = Math.max(1, Math.round(BLOCK_SECONDS * sampleRate));
  let total = 0;
  let counted = 0;
  for (let start = 0; start < frames; start += block) {
    const end = Math.min(frames, start + block);
    let sum = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i++) sum += channel[i]! * channel[i]!;
    }
    const power = sum / ((end - start) * channels.length);
    if (power > 0 && toDb(power) > GATE_DB) {
      total += power;
      counted++;
    }
  }
  if (counted === 0) return null;
  const db = toDb(total / counted);
  return (
    Math.round(Math.min(LOUDNESS_MAX, Math.max(LOUDNESS_MIN, db)) * 10) / 10
  );
}

/** How far to turn a version down so it plays as loud as the quietest. */
export function matchGainDb(
  loudness: number | null,
  quietest: number | null,
): number {
  if (loudness === null || quietest === null) return 0;
  // Only ever down, and at most 12 dB: the number comes from the uploader's
  // browser, so a wrong one cannot make anything louder or vanish.
  return Math.max(-12, Math.min(0, quietest - loudness));
}
