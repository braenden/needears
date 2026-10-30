import { describe, expect, it } from "vitest";
import { decodeAiff } from "./aiff";

// Builds a 16 bit stereo AIFF (or AIFF-C "sowt") with the given frames.
function aiff(frames: [number, number][], { sowt = false } = {}) {
  const commSize = sowt ? 24 : 18;
  const dataBytes = frames.length * 4;
  const total = 12 + 8 + commSize + 8 + 8 + dataBytes;
  const view = new DataView(new ArrayBuffer(total));
  const ascii = (at: number, text: string) =>
    [...text].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  ascii(0, "FORM");
  view.setUint32(4, total - 8);
  ascii(8, sowt ? "AIFC" : "AIFF");
  ascii(12, "COMM");
  view.setUint32(16, commSize);
  view.setInt16(20, 2);
  view.setUint32(22, frames.length);
  view.setInt16(26, 16);
  // 44100 as an 80 bit extended float.
  view.setUint16(28, 0x400e);
  view.setUint32(30, 0xac440000);
  view.setUint32(34, 0);
  if (sowt) ascii(38, "sowt");
  let at = 20 + commSize;
  ascii(at, "SSND");
  view.setUint32(at + 4, 8 + dataBytes);
  at += 16;
  for (const [l, r] of frames) {
    view.setInt16(at, l, sowt);
    view.setInt16(at + 2, r, sowt);
    at += 4;
  }
  return view.buffer;
}

describe("decodeAiff", () => {
  it("reads big endian PCM and the sample rate", () => {
    const pcm = decodeAiff(
      aiff([
        [16384, -32768],
        [0, 32767],
      ]),
    );
    expect(pcm?.sampleRate).toBe(44100);
    expect(Array.from(pcm!.channels[0]!)).toEqual([0.5, 0]);
    expect(pcm!.channels[1]![0]).toBe(-1);
  });

  it("reads little endian AIFF-C (sowt)", () => {
    const pcm = decodeAiff(aiff([[16384, 0]], { sowt: true }));
    expect(pcm!.channels[0]![0]).toBe(0.5);
  });

  it("refuses anything else", () => {
    expect(decodeAiff(new ArrayBuffer(64))).toBeNull();
  });
});
