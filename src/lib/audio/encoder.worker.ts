/// <reference lib="webworker" />
import { Mp3Encoder } from "@breezystack/lamejs";

// Encodes PCM to mp3 off the main thread, so the page stays responsive
// while people fill in the form. Input: Float32 channels (transferred).
// Output: progress messages, then the finished mp3 as a Blob.

export type EncodeRequest = {
  channels: Float32Array[];
  sampleRate: number;
  kbps: number;
};

export type EncodeMessage =
  | { type: "progress"; progress: number }
  | { type: "done"; mp3: Blob }
  | { type: "error" };

// lamejs works in frames of 1152 samples; a few frames per call keeps the
// overhead low.
const BLOCK = 1152 * 16;

function toInt16(input: Float32Array, start: number, end: number) {
  const out = new Int16Array(end - start);
  for (let i = start; i < end; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i - start] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

self.onmessage = (event: MessageEvent<EncodeRequest>) => {
  try {
    const { channels, sampleRate, kbps } = event.data;
    const [left, right] = channels;
    if (!left) throw new Error("No audio");
    const encoder = new Mp3Encoder(channels.length, sampleRate, kbps);
    const parts: BlobPart[] = [];
    let lastReport = 0;
    for (let start = 0; start < left.length; start += BLOCK) {
      const end = Math.min(left.length, start + BLOCK);
      const chunk = right
        ? encoder.encodeBuffer(
            toInt16(left, start, end),
            toInt16(right, start, end),
          )
        : encoder.encodeBuffer(toInt16(left, start, end));
      if (chunk.length > 0) parts.push(new Uint8Array(chunk));
      const progress = end / left.length;
      if (progress - lastReport >= 0.01) {
        lastReport = progress;
        self.postMessage({
          type: "progress",
          progress,
        } satisfies EncodeMessage);
      }
    }
    const tail = encoder.flush();
    if (tail.length > 0) parts.push(new Uint8Array(tail));
    self.postMessage({
      type: "done",
      mp3: new Blob(parts, { type: "audio/mpeg" }),
    } satisfies EncodeMessage);
  } catch {
    self.postMessage({ type: "error" } satisfies EncodeMessage);
  }
};
