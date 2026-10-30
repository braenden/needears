import { describe, expect, it } from "vitest";
import { peaksSchema } from "./peaks";
import { computePeaks, displayPeaks, downsample } from "./waveform";

const channel = (n: number, value = 128) =>
  Array.from({ length: n }, () => value);

describe("peaksSchema", () => {
  it("accepts mono and stereo peaks", () => {
    expect(
      peaksSchema.safeParse({ version: 1, channels: [channel(2000)] }).success,
    ).toBe(true);
    expect(
      peaksSchema.safeParse({
        version: 1,
        channels: [channel(2000), channel(2000)],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["wrong version", { version: 2, channels: [channel(2000)] }],
    ["too few points", { version: 1, channels: [channel(10)] }],
    ["too many points", { version: 1, channels: [channel(5000)] }],
    ["out of range", { version: 1, channels: [channel(200, 300)] }],
    ["fractions", { version: 1, channels: [channel(200, 0.5)] }],
    [
      "three channels",
      { version: 1, channels: [channel(200), channel(200), channel(200)] },
    ],
    ["uneven channels", { version: 1, channels: [channel(200), channel(300)] }],
    ["extra keys", { version: 1, channels: [channel(200)], html: "<script>" }],
  ])("rejects %s", (_name, value) => {
    expect(peaksSchema.safeParse(value).success).toBe(false);
  });
});

describe("computePeaks", () => {
  it("makes valid stored peaks scaled to the loudest slice", () => {
    const left = new Float32Array(44_100).map((_, i) =>
      i < 22_050 ? 0.1 : 0.5,
    );
    const right = new Float32Array(44_100).map(() => -0.25);
    const peaks = computePeaks([left, right], 200);
    expect(peaksSchema.safeParse(peaks).success).toBe(true);
    expect(peaks.channels[0]![0]).toBe(51);
    expect(peaks.channels[0]![199]).toBe(255);
    expect(peaks.channels[1]![0]).toBe(128);
  });

  it("gives zeros for silence", () => {
    const peaks = computePeaks([new Float32Array(1000)], 100);
    expect(peaks.channels[0]!.every((v) => v === 0)).toBe(true);
  });
});

describe("displayPeaks", () => {
  it("takes the louder channel and scales to 0 to 1", () => {
    expect(
      displayPeaks({
        version: 1,
        channels: [
          [0, 255, 51],
          [102, 0, 51],
        ],
      }),
    ).toEqual([0.4, 1, 0.2]);
  });
});

describe("downsample", () => {
  it("keeps the peak of each bucket", () => {
    expect(downsample([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3]);
  });
});
