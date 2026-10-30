import { decodeAiff, type Pcm } from "./aiff";

// Decodes an audio file in the browser with Web Audio.
// Everything is resampled to 44.1 kHz, which lamejs encodes directly.
export const DECODE_SAMPLE_RATE = 44_100;

export type Decoded = {
  // One array per channel, at most two.
  channels: Float32Array[];
  sampleRate: number;
  durationMs: number;
};

export class DecodeError extends Error {
  constructor(readonly reason: "decode_failed" | "flac_unsupported") {
    super(reason);
  }
}

function fromBuffer(buffer: AudioBuffer): Decoded {
  const count = Math.min(2, buffer.numberOfChannels);
  return {
    channels: Array.from({ length: count }, (_, i) => buffer.getChannelData(i)),
    sampleRate: buffer.sampleRate,
    durationMs: Math.round(buffer.duration * 1000),
  };
}

// Plays PCM through an offline context at 44.1 kHz, which resamples it.
async function resample(pcm: Pcm): Promise<AudioBuffer> {
  const frames = pcm.channels[0]!.length;
  const length = Math.ceil((frames * DECODE_SAMPLE_RATE) / pcm.sampleRate);
  const context = new OfflineAudioContext(
    pcm.channels.length,
    length,
    DECODE_SAMPLE_RATE,
  );
  const source = context.createBufferSource();
  source.buffer = context.createBuffer(
    pcm.channels.length,
    frames,
    pcm.sampleRate,
  );
  pcm.channels.forEach((channel, i) =>
    source.buffer!.copyToChannel(channel as Float32Array<ArrayBuffer>, i),
  );
  source.connect(context.destination);
  source.start();
  return context.startRendering();
}

export async function decodeAudio(file: File): Promise<Decoded> {
  const data = await file.arrayBuffer();
  // An offline context decodes without touching the audio hardware, so it
  // works before any user gesture and on muted devices.
  const context = new OfflineAudioContext(2, 1, DECODE_SAMPLE_RATE);
  // decodeAudioData detaches the buffer it gets; AIFF keeps the original
  // for the fallback below (a copy only for AIFF, they can be big).
  const isAiff = /\.aiff?$/i.test(file.name);
  let buffer: AudioBuffer | null = null;
  try {
    buffer = await context.decodeAudioData(isAiff ? data.slice(0) : data);
  } catch {
    // Only Safari decodes AIFF natively; read uncompressed PCM ourselves.
    const pcm = isAiff ? decodeAiff(data) : null;
    if (pcm) buffer = await resample(pcm);
  }
  if (!buffer) {
    // Older Safari cannot decode FLAC; tell people what to do about it.
    const isFlac = /\.flac$/i.test(file.name) || /flac/.test(file.type);
    throw new DecodeError(isFlac ? "flac_unsupported" : "decode_failed");
  }
  if (buffer.length === 0) throw new DecodeError("decode_failed");
  return fromBuffer(buffer);
}
