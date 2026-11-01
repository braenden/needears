import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  audioInfo,
  listAudio,
  presignAudioPlayback,
  presignAudioUpload,
  readAudioStart,
  removeAudio,
} = await import("./r2");

// Runs against the local stand-in (`pnpm r2:start`) when R2_ENDPOINT is set,
// as in CI.
describe.runIf(process.env.R2_ENDPOINT)("R2 audio", () => {
  const user = randomUUID();
  const key = () => `${user}/${randomUUID()}.mp3`;
  const body = (size: number) => new Blob([new Uint8Array(size).fill(0xff)]);
  const put = (url: string, data: Blob, headers: HeadersInit) =>
    fetch(url, { method: "PUT", body: data, headers }).then((r) => r.status);
  const audioHeaders = { "Content-Type": "audio/mpeg", "If-None-Match": "*" };

  it("only accepts the signed size and type, once", async () => {
    const k = key();
    const url = await presignAudioUpload(k, 100);
    expect(
      await put(url, body(100), {
        ...audioHeaders,
        "Content-Type": "text/html",
      }),
    ).toBe(403);
    expect(await put(url, body(101), audioHeaders)).toBe(403);
    expect(await put(url, body(100), { "Content-Type": "audio/mpeg" })).toBe(
      403,
    );
    expect(await audioInfo(k)).toBeNull();

    expect(await put(url, body(100), audioHeaders)).toBe(200);
    expect(await put(url, body(100), audioHeaders)).toBe(412);
    expect(await audioInfo(k)).toEqual({
      size: 100,
      contentType: "audio/mpeg",
    });
  });

  it("refuses keys and sizes the app would never sign", async () => {
    await expect(presignAudioUpload("../x.mp3", 100)).rejects.toThrow();
    await expect(
      presignAudioUpload(`${user}/${randomUUID()}.exe`, 100),
    ).rejects.toThrow();
    await expect(presignAudioUpload(key(), 26 * 1024 * 1024)).rejects.toThrow();
    expect(await removeAudio(["not-a-folder.mp3"])).toBe(false);
  });

  it("plays, reads the start, lists and removes", async () => {
    const k = key();
    expect(
      await put(await presignAudioUpload(k, 4096), body(4096), audioHeaders),
    ).toBe(200);

    const play = await fetch(await presignAudioPlayback(k, 60), {
      headers: { Range: "bytes=0-9" },
    });
    expect(play.status).toBe(206);
    expect((await readAudioStart(k, 16))?.length).toBe(16);

    const listed = await listAudio({ userId: user });
    expect(listed?.objects.map((o) => o.key)).toContain(k);

    expect(await removeAudio([k, `${user}/${randomUUID()}.mp3`])).toBe(true);
    expect(await audioInfo(k)).toBeNull();
  });
});
