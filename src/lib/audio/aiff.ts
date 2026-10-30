// A small AIFF and AIFF-C reader for uncompressed PCM. Chrome and Firefox
// cannot decode AIFF with Web Audio (only Safari can), and AIFF is what
// Logic and older DAWs export, so the pipeline falls back to this.

export type Pcm = { channels: Float32Array[]; sampleRate: number };

function readFourCC(view: DataView, offset: number) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

// The sample rate is an 80 bit IEEE 754 extended float.
function readExtended(view: DataView, offset: number): number {
  const exponent = view.getUint16(offset) & 0x7fff;
  const hi = view.getUint32(offset + 2);
  const lo = view.getUint32(offset + 6);
  if (exponent === 0 && hi === 0 && lo === 0) return 0;
  return (hi * 2 ** 32 + lo) * 2 ** (exponent - 16383 - 63);
}

// Returns null when the file is not an AIFF this reader understands
// (compressed AIFF-C, odd bit depths), so the caller can report it.
export function decodeAiff(buffer: ArrayBuffer): Pcm | null {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || readFourCC(view, 0) !== "FORM") return null;
  const form = readFourCC(view, 8);
  if (form !== "AIFF" && form !== "AIFC") return null;

  let channels = 0;
  let frames = 0;
  let bits = 0;
  let sampleRate = 0;
  let littleEndian = false;
  let dataOffset = -1;

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const id = readFourCC(view, offset);
    const size = view.getUint32(offset + 4);
    const body = offset + 8;
    if (id === "COMM") {
      channels = view.getInt16(body);
      frames = view.getUint32(body + 2);
      bits = view.getInt16(body + 6);
      sampleRate = readExtended(view, body + 8);
      if (form === "AIFC") {
        const compression = readFourCC(view, body + 18);
        if (compression === "sowt") littleEndian = true;
        else if (compression !== "NONE") return null;
      }
    } else if (id === "SSND") {
      // offset and block size fields, then the samples.
      dataOffset = body + 8 + view.getUint32(body);
    }
    // Chunks are padded to an even length.
    offset = body + size + (size % 2);
  }

  if (dataOffset < 0 || channels < 1 || frames < 1 || sampleRate <= 0)
    return null;
  if (![8, 16, 24, 32].includes(bits)) return null;
  const bytes = bits / 8;
  const kept = Math.min(channels, 2);
  const available = Math.floor(
    (buffer.byteLength - dataOffset) / (bytes * channels),
  );
  const length = Math.min(frames, available);
  const out = Array.from({ length: kept }, () => new Float32Array(length));
  const scale = 2 ** (bits - 1);

  for (let i = 0; i < length; i++) {
    for (let c = 0; c < kept; c++) {
      const at = dataOffset + (i * channels + c) * bytes;
      let value: number;
      if (bits === 8) value = view.getInt8(at);
      else if (bits === 16) value = view.getInt16(at, littleEndian);
      else if (bits === 32) value = view.getInt32(at, littleEndian);
      else {
        const [b0, b1, b2] = littleEndian
          ? [view.getUint8(at + 2), view.getUint8(at + 1), view.getUint8(at)]
          : [view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2)];
        value = ((b0 << 24) | (b1 << 16) | (b2 << 8)) >> 8;
      }
      out[c]![i] = value / scale;
    }
  }
  return { channels: out, sampleRate: Math.round(sampleRate) };
}
