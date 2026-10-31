import { describe, expect, it } from "vitest";

import { matchGainDb, measureLoudness } from "./loudness";

const RATE = 8000;

function sine(amplitude: number, seconds: number) {
  const out = new Float32Array(RATE * seconds);
  for (let i = 0; i < out.length; i++)
    out[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / RATE);
  return out;
}

describe("measureLoudness", () => {
  it("measures a full scale sine at about -3 dBFS", () => {
    expect(measureLoudness([sine(1, 2)], RATE)).toBeCloseTo(-3, 0);
  });

  it("is 6 dB lower at half the amplitude", () => {
    const loud = measureLoudness([sine(1, 2)], RATE)!;
    const quiet = measureLoudness([sine(0.5, 2)], RATE)!;
    expect(loud - quiet).toBeCloseTo(6, 0);
  });

  it("leaves silence out", () => {
    const withTail = new Float32Array(RATE * 6);
    withTail.set(sine(1, 2));
    expect(measureLoudness([withTail], RATE)).toBeCloseTo(
      measureLoudness([sine(1, 2)], RATE)!,
      1,
    );
    expect(measureLoudness([new Float32Array(RATE)], RATE)).toBeNull();
  });
});

describe("matchGainDb", () => {
  it("turns the louder version down to the quietest, never up", () => {
    expect(matchGainDb(-8, -11)).toBe(-3);
    expect(matchGainDb(-11, -11) === 0).toBe(true);
    expect(matchGainDb(-2, -40)).toBe(-12);
    expect(matchGainDb(null, -11)).toBe(0);
  });
});
