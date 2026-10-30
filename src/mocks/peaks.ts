/** Small seeded random generator so mock data is the same on server and client. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fake peaks with a song-like shape: quiet intro, verse, a loud drop, a
 * breakdown and an outro. Normalised 0 to 1, like the real pipeline output.
 */
export function mockPeaks(seed: number, length = 2000) {
  const rand = seeded(seed);
  const sections = [0.28, 0.55, 0.95, 0.4, 0.9, 0.2];
  const peaks: number[] = [];
  for (let i = 0; i < length; i++) {
    const pos = (i / length) * sections.length;
    const index = Math.min(sections.length - 1, Math.floor(pos));
    const nextIndex = Math.min(sections.length - 1, index + 1);
    const t = pos - index;
    const ease = t < 0.85 ? 0 : (t - 0.85) / 0.15;
    const level = sections[index]! * (1 - ease) + sections[nextIndex]! * ease;
    const beat = 0.75 + 0.25 * Math.abs(Math.sin(i * 0.19));
    const value = level * beat * (0.65 + 0.35 * rand());
    peaks.push(Math.min(1, Math.max(0.02, value)));
  }
  // Fade in and out so the edges look like a real export.
  for (let i = 0; i < 40; i++) {
    peaks[i] = peaks[i]! * (i / 40);
    peaks[length - 1 - i] = peaks[length - 1 - i]! * (i / 40);
  }
  // Quantise to 8 bit like the real pipeline, which also keeps server and
  // client renders identical.
  return peaks.map((p) => Math.round(p * 255) / 255);
}
