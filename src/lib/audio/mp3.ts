// Minimal MP3 inspection for upload verification: checks the magic bytes
// (an MPEG audio layer III frame, optionally after an ID3v2 tag) and
// estimates the duration from the first frame header. Reads only the start
// of the file, so the server never has to download the whole upload.

export type Mp3Info = {
  durationMs: number;
  bitrateKbps: number;
  sampleRate: number;
  vbr: boolean;
};

// The highest bitrate layer III allows is 320 kbps. A VBR file whose size
// and frame count work out to more than that is not plain audio: the frame
// count in the Xing header was faked to pass the duration check while the
// rest of the file is something else. The margin covers tags at the end.
const MAX_AVERAGE_KBPS = 336;

const BITRATES_V1 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const BITRATES_V2 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

type FrameHeader = {
  version: number;
  bitrateKbps: number;
  sampleRate: number;
  mono: boolean;
  length: number;
  samplesPerFrame: number;
};

function parseFrameHeader(
  bytes: Uint8Array,
  offset: number,
): FrameHeader | null {
  if (offset + 4 > bytes.length) return null;
  const b1 = bytes[offset + 1]!;
  const b2 = bytes[offset + 2]!;
  const b3 = bytes[offset + 3]!;
  if (bytes[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const version = (b1 >> 3) & 0x03;
  const layer = (b1 >> 1) & 0x03;
  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;
  const mono = ((b3 >> 6) & 0x03) === 3;

  // Layer III only, no reserved or free format values.
  if (version === 1 || layer !== 1) return null;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3)
    return null;

  const v1 = version === 3;
  const bitrateKbps = (v1 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex]!;
  const sampleRate = SAMPLE_RATES[version]![sampleRateIndex]!;
  const samplesPerFrame = v1 ? 1152 : 576;
  const length =
    Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate) +
    padding;

  return { version, bitrateKbps, sampleRate, mono, length, samplesPerFrame };
}

function id3v2Size(bytes: Uint8Array): number {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  )
    return 0;
  const size =
    ((bytes[6]! & 0x7f) << 21) |
    ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) |
    (bytes[9]! & 0x7f);
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

// Frame count from a Xing or Info header, used by VBR encoders.
function xingFrames(
  bytes: Uint8Array,
  offset: number,
  header: FrameHeader,
): number | null {
  const sideInfo =
    header.version === 3 ? (header.mono ? 17 : 32) : header.mono ? 9 : 17;
  const at = offset + 4 + sideInfo;
  if (at + 12 > bytes.length) return null;
  const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag !== "Xing" && tag !== "Info") return null;
  const flags = new DataView(
    bytes.buffer,
    bytes.byteOffset + at + 4,
    4,
  ).getUint32(0);
  if ((flags & 0x01) === 0) return null;
  return new DataView(bytes.buffer, bytes.byteOffset + at + 8, 4).getUint32(0);
}

// `head` is the start of the file (64 KB is plenty), `totalBytes` its full
// size. Returns null if this does not look like an MP3 file.
export function inspectMp3(
  head: Uint8Array,
  totalBytes: number,
): Mp3Info | null {
  const start = id3v2Size(head);
  // An ID3 tag larger than the head we fetched (for example embedded
  // artwork) means we cannot see the first frame. Treat as invalid; the
  // browser pipeline writes files without artwork.
  const searchEnd = Math.min(head.length - 4, start + 4096);

  for (let offset = start; offset < searchEnd; offset++) {
    const header = parseFrameHeader(head, offset);
    if (!header) continue;

    // Require a second valid frame right after the first, so random bytes
    // that happen to look like a sync word do not pass.
    const next = parseFrameHeader(head, offset + header.length);
    if (
      !next ||
      next.version !== header.version ||
      next.sampleRate !== header.sampleRate
    ) {
      continue;
    }

    const frames = xingFrames(head, offset, header);
    if (frames !== null && frames > 0) {
      const durationMs = Math.round(
        (frames * header.samplesPerFrame * 1000) / header.sampleRate,
      );
      const bitrateKbps = Math.round(((totalBytes - offset) * 8) / durationMs);
      if (bitrateKbps > MAX_AVERAGE_KBPS) return null;
      return {
        durationMs,
        bitrateKbps,
        sampleRate: header.sampleRate,
        vbr: true,
      };
    }

    const durationMs = Math.round(
      ((totalBytes - offset) * 8) / header.bitrateKbps,
    );
    return {
      durationMs,
      bitrateKbps: header.bitrateKbps,
      sampleRate: header.sampleRate,
      vbr: false,
    };
  }

  return null;
}
