import { describe, expect, it } from "vitest";
import { sniffAvatarType } from "./image";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) => (typeof v === "string" ? [...Buffer.from(v)] : [v])),
  );

describe("sniffAvatarType", () => {
  it("recognises JPEG and WebP", () => {
    expect(sniffAvatarType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffAvatarType(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe(
      "image/webp",
    );
  });

  it.each([
    ["an mp3", bytes("ID3", 4, 0, 0)],
    ["HTML", bytes("<html><script>")],
    ["SVG", bytes("<svg xmlns=")],
    ["a WAV file", bytes("RIFF", 0, 0, 0, 0, "WAVE")],
    ["nothing", bytes()],
  ])("rejects %s", (_name, value) => {
    expect(sniffAvatarType(value)).toBeNull();
  });
});
