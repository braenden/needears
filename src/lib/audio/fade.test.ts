import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canFade,
  FADE_MS,
  fadedSeek,
  fadeInPlay,
  fadeOutPause,
  setListenerVolume,
} from "./fade";

/** Just enough of an audio element. `ios` ignores volume, like iPhones. */
function fakeAudio({ ios = false } = {}) {
  let volume = 1;
  const listeners = new Map<string, () => void>();
  const element = {
    paused: true,
    currentTime: 0,
    volumes: [] as number[],
    get volume() {
      return volume;
    },
    set volume(v: number) {
      if (ios) return;
      volume = v;
      element.volumes.push(v);
    },
    play: vi.fn(async () => {
      element.paused = false;
    }),
    pause: vi.fn(() => {
      element.paused = true;
    }),
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    fire: (type: string) => listeners.get(type)?.(),
  };
  return element;
}
type Fake = ReturnType<typeof fakeAudio>;
const asMedia = (fake: Fake) => fake as unknown as HTMLMediaElement;

beforeEach(() =>
  vi.useFakeTimers({
    toFake: [
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
      "performance",
    ],
  }),
);
afterEach(() => vi.useRealTimers());

const settle = async (ms = FADE_MS + 10) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe("fades", () => {
  it("fades in on play and ends exactly at the listener's volume", async () => {
    const audio = fakeAudio();
    setListenerVolume(asMedia(audio), 0.6);
    const done = fadeInPlay(asMedia(audio));
    await settle();
    await done;
    expect(audio.paused).toBe(false);
    expect(audio.volumes.some((v) => v > 0 && v < 0.6)).toBe(true);
    expect(audio.volume).toBe(0.6);
  });

  it("pauses after fading out, then is back at full volume", async () => {
    const audio = fakeAudio();
    setListenerVolume(asMedia(audio), 0.8);
    audio.paused = false;
    const done = fadeOutPause(asMedia(audio));
    expect(audio.pause).not.toHaveBeenCalled();
    await settle();
    await done;
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.volume).toBe(0.8);
  });

  it("a play during the fade out cancels the pause", async () => {
    const audio = fakeAudio();
    setListenerVolume(asMedia(audio), 1);
    audio.paused = false;
    const pausing = fadeOutPause(asMedia(audio));
    await vi.advanceTimersByTimeAsync(FADE_MS / 2);
    const playing = fadeInPlay(asMedia(audio));
    await settle();
    await Promise.all([pausing, playing]);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(audio.volume).toBe(1);
  });

  it("the volume slider wins during a fade", async () => {
    const audio = fakeAudio();
    setListenerVolume(asMedia(audio), 1);
    const done = fadeInPlay(asMedia(audio));
    await vi.advanceTimersByTimeAsync(FADE_MS / 2);
    setListenerVolume(asMedia(audio), 0.3);
    expect(audio.volume).toBeLessThanOrEqual(0.3);
    await settle();
    await done;
    expect(audio.volume).toBe(0.3);
  });

  it("seeks at once while paused, without touching the volume", async () => {
    const audio = fakeAudio();
    setListenerVolume(asMedia(audio), 0.5);
    const before = audio.volumes.length;
    await fadedSeek(asMedia(audio), 12);
    expect(audio.currentTime).toBe(12);
    expect(audio.volumes.length).toBe(before);
  });

  it("while playing, fades out, jumps, waits for the jump, fades in", async () => {
    const audio = fakeAudio();
    setListenerVolume(asMedia(audio), 1);
    audio.paused = false;
    const done = fadedSeek(asMedia(audio), 30);
    expect(audio.currentTime).toBe(0);
    await settle();
    expect(audio.currentTime).toBe(30);
    expect(audio.volume).toBe(0);
    audio.fire("seeked");
    await settle();
    await done;
    expect(audio.volume).toBe(1);
  });

  it("a second seek during the first goes where the second asked", async () => {
    const audio = fakeAudio();
    setListenerVolume(asMedia(audio), 1);
    audio.paused = false;
    const first = fadedSeek(asMedia(audio), 10);
    await vi.advanceTimersByTimeAsync(FADE_MS / 2);
    const second = fadedSeek(asMedia(audio), 50);
    await settle();
    audio.fire("seeked");
    await settle(400);
    await Promise.all([first, second]);
    expect(audio.currentTime).toBe(50);
    expect(audio.volume).toBe(1);
  });

  it("does it all at once where the volume cannot change (iOS)", async () => {
    const audio = fakeAudio({ ios: true });
    expect(canFade(asMedia(audio))).toBe(false);
    await fadeInPlay(asMedia(audio));
    expect(audio.paused).toBe(false);
    await fadeOutPause(asMedia(audio));
    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(1);
  });
});

describe("a busy page", () => {
  it("delays the fade instead of skipping it, two steps a tick at most", async () => {
    const audio = fakeAudio();
    setListenerVolume(asMedia(audio), 1);
    audio.paused = false;
    // Every tick comes 20 ms late, as when a render holds the page.
    let clock = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => {
      clock += 20;
      return clock;
    });
    const heard: number[] = [];
    const record = () => {
      if (!audio.paused) heard.push(audio.volume);
    };
    const done = fadeOutPause(asMedia(audio));
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(4);
      record();
    }
    await done;
    now.mockRestore();
    // It took several steps, not one jump from full volume to silence.
    const jumps = heard.map((v, i) => Math.abs(v - (heard[i - 1] ?? 1)));
    expect(heard.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...jumps)).toBeLessThan(0.4);
    expect(audio.pause).toHaveBeenCalledOnce();
  });
});
