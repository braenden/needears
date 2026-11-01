import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { exchangeGoogleCode, usableGoogleIdToken } =
  await import("./google-code");

const CLIENT = "id.apps.googleusercontent.com";
const NOW = Date.UTC(2026, 10, 1, 12);

const token = (claims: Record<string, unknown>) =>
  [
    Buffer.from('{"alg":"RS256"}').toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");

const good = {
  iss: "https://accounts.google.com",
  aud: CLIENT,
  azp: CLIENT,
  sub: "123",
  email: "nora.k@gmail.com",
  email_verified: true,
  exp: NOW / 1000 + 3600,
};

describe("usableGoogleIdToken", () => {
  it("accepts Google's token for our client", () => {
    expect(usableGoogleIdToken(token(good), CLIENT, NOW)).toBe(true);
    expect(
      usableGoogleIdToken(
        token({ ...good, iss: "accounts.google.com", aud: [CLIENT] }),
        CLIENT,
        NOW,
      ),
    ).toBe(true);
  });

  it("refuses a token for another client or from someone else", () => {
    const other = "other.apps.googleusercontent.com";
    expect(
      usableGoogleIdToken(token({ ...good, aud: other }), CLIENT, NOW),
    ).toBe(false);
    expect(
      usableGoogleIdToken(token({ ...good, azp: other }), CLIENT, NOW),
    ).toBe(false);
    expect(
      usableGoogleIdToken(
        token({ ...good, iss: "https://evil.example" }),
        CLIENT,
        NOW,
      ),
    ).toBe(false);
  });

  it("refuses an expired token or an unverified address", () => {
    expect(
      usableGoogleIdToken(token({ ...good, exp: NOW / 1000 - 1 }), CLIENT, NOW),
    ).toBe(false);
    expect(
      usableGoogleIdToken(
        token({ ...good, email_verified: false }),
        CLIENT,
        NOW,
      ),
    ).toBe(false);
    expect(
      usableGoogleIdToken(token({ ...good, email: undefined }), CLIENT, NOW),
    ).toBe(false);
  });

  it("refuses something that is not a token", () => {
    expect(usableGoogleIdToken("nonsense", CLIENT, NOW)).toBe(false);
    expect(usableGoogleIdToken("a.bm90IGpzb24.c", CLIENT, NOW)).toBe(false);
  });
});

describe("exchangeGoogleCode", () => {
  it("swaps the code with our secret for the popup's redirect", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ id_token: "id-token", access_token: "at" }),
    );
    await expect(
      exchangeGoogleCode("the-code", CLIENT, "secret", fetchImpl),
    ).resolves.toEqual({ ok: true, idToken: "id-token" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      code: "the-code",
      client_id: CLIENT,
      client_secret: "secret",
      redirect_uri: "postmessage",
      grant_type: "authorization_code",
    });
  });

  it("tells a refused code from Google being away", async () => {
    const answer = (response: Response) =>
      exchangeGoogleCode("c", CLIENT, "s", async () => response);
    await expect(
      answer(Response.json({ error: "invalid_grant" }, { status: 400 })),
    ).resolves.toEqual({ ok: false, reason: "rejected" });
    await expect(answer(new Response(null, { status: 503 }))).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    await expect(answer(Response.json({}))).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    await expect(
      exchangeGoogleCode("c", CLIENT, "s", async () => {
        throw new Error("offline");
      }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});
