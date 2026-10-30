import { useSyncExternalStore } from "react";

/**
 * Builds a tiny WAV in the browser so the player on /design can really play
 * without any audio files in the repo: 8 kHz, 8 bit, mono, near silence with
 * a soft tick on every beat at 120 bpm.
 */
function createMockAudioUrl(durationMs: number) {
  const sampleRate = 8000;
  const length = Math.ceil((durationMs / 1000) * sampleRate);
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, length, true);
  const beat = sampleRate / 2;
  for (let i = 0; i < length; i++) {
    const inBeat = i % beat;
    const tick =
      inBeat < 240
        ? Math.sin((inBeat / sampleRate) * 2 * Math.PI * 1200) *
          (1 - inBeat / 240) *
          18
        : 0;
    view.setUint8(44 + i, 128 + Math.round(tick));
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

const cache = new Map<number, string>();
const noop = () => () => {};

/** Client-only mock audio URL. Null during server render and hydration. */
export function useMockAudioUrl(durationMs: number) {
  return useSyncExternalStore(
    noop,
    () => {
      let url = cache.get(durationMs);
      if (!url) {
        url = createMockAudioUrl(durationMs);
        cache.set(durationMs, url);
      }
      return url;
    },
    () => null,
  );
}
