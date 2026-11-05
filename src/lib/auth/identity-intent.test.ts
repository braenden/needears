import { afterEach, describe, expect, it, vi } from "vitest";
import { requestIdentityIntent } from "./identity-intent";

const fetchMock = vi.fn();

function reply(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
  });
}

describe("requestIdentityIntent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("asks for an email change intent", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(reply(204));
    expect(await requestIdentityIntent("email_change", "email")).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/account/identity-intent");
    expect(JSON.parse(init.body)).toEqual({
      action: "email_change",
      provider: "email",
    });
  });

  it("says when the session must sign in again", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      reply(403, { error: { code: "reauth_required" } }),
    );
    expect(await requestIdentityIntent("email_change", "email")).toBe("reauth");
  });

  it("fails on anything else", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(reply(500));
    expect(await requestIdentityIntent("link", "google")).toBe("failed");
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await requestIdentityIntent("link", "google")).toBe("failed");
  });
});
