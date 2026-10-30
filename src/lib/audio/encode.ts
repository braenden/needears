import { ENCODE_KBPS } from "@/config/upload";
import type { Decoded } from "./decode";
import type { EncodeMessage, EncodeRequest } from "./encoder.worker";

// Encodes decoded audio to a 192 kbps mp3 in a Web Worker. The channel data
// is copied before it is handed over, so the caller's buffers stay usable.
export function encodeMp3(
  audio: Decoded,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./encoder.worker.ts", import.meta.url), {
      type: "module",
    });
    const channels = audio.channels.map((c) => c.slice());
    worker.onmessage = (event: MessageEvent<EncodeMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress(message.progress);
        return;
      }
      worker.terminate();
      if (message.type === "done") resolve(message.mp3);
      else reject(new Error("Encoding failed"));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Encoding failed"));
    };
    const request: EncodeRequest = {
      channels,
      sampleRate: audio.sampleRate,
      kbps: ENCODE_KBPS,
    };
    worker.postMessage(
      request,
      channels.map((c) => c.buffer),
    );
  });
}
