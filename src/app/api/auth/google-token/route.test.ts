import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const CLIENT_ID = "id.apps.googleusercontent.com";
const SITE = "https://needears.com";

const { POST } = await import("./route");

function token(claims: Record<string, unknown>) {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

const goodToken = () =>
  token({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    azp: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: "nora@example.com",
    email_verified: true,
  });

function ask(
  body: unknown,
  {
    origin = SITE,
    contentType = "application/json",
  }: { origin?: string | null; contentType?: string | null } = {},
) {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  if (contentType) headers.set("Content-Type", contentType);
  return POST(
    new Request(`${SITE}/api/auth/google-token`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const google = vi.fn();
const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubGlobal("fetch", google);
  google.mockResolvedValue(Response.json({ id_token: goodToken() }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  google.mockReset();
  errorLog.mockClear();
});

describe("POST /api/auth/google-token", () => {
  it("swaps the code for Google's ID token and hands it back", async () => {
    const response = await ask({ code: "4/0Abc-def_ghi" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ idToken: goodToken() });
    const [url, init] = google.mock.calls[0]!;
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const sent = new URLSearchParams(init.body as URLSearchParams);
    expect(sent.get("code")).toBe("4/0Abc-def_ghi");
    expect(sent.get("client_id")).toBe(CLIENT_ID);
    expect(sent.get("client_secret")).toBe("secret");
    expect(sent.get("redirect_uri")).toBe("postmessage");
  });

  it("only answers our own site", async () => {
    for (const origin of ["https://evil.example", null]) {
      const response = await ask({ code: "4/code" }, { origin });
      expect(response.status).toBe(403);
    }
    expect(google).not.toHaveBeenCalled();
  });

  it("only takes JSON, small, with just a printable code", async () => {
    const bad: [unknown, { contentType?: string | null }?][] = [
      [{ code: "4/code" }, { contentType: "text/plain" }],
      [{ code: "4/code" }, { contentType: null }],
      ["not json"],
      [{ code: "" }],
      [{ code: "4/has space" }],
      [{ code: "x".repeat(2049) }],
      [{ code: "4/code", next: "/admin" }],
      [{ code: 42 }],
      [JSON.stringify({ code: "x".repeat(5000) })],
    ];
    for (const [body, options] of bad) {
      const response = await ask(body, options);
      expect([400, 415]).toContain(response.status);
    }
    expect(google).not.toHaveBeenCalled();
  });

  it("is off without a client ID or secret", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect((await ask({ code: "4/code" })).status).toBe(503);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    expect((await ask({ code: "4/code" })).status).toBe(503);
    expect(google).not.toHaveBeenCalled();
  });

  it("turns down a code Google does not accept", async () => {
    google.mockResolvedValue(new Response("{}", { status: 400 }));
    const response = await ask({ code: "4/used" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_code");
  });

  it("says so when Google does not answer", async () => {
    google.mockRejectedValue(new Error("timeout"));
    expect((await ask({ code: "4/code" })).status).toBe(502);
  });

  it("hands back no token meant for someone else, expired or unverified", async () => {
    const base = {
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: "nora@example.com",
      email_verified: true,
    };
    for (const claims of [
      { ...base, aud: "other.apps.googleusercontent.com" },
      { ...base, azp: "other.apps.googleusercontent.com" },
      { ...base, iss: "https://evil.example" },
      { ...base, exp: Math.floor(Date.now() / 1000) - 10 },
      { ...base, email_verified: false },
    ]) {
      google.mockResolvedValue(Response.json({ id_token: token(claims) }));
      const response = await ask({ code: "4/code" });
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain("signature");
    }
  });

  it("never logs the code or the token", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await ask({ code: "4/secret-code" });
    google.mockResolvedValue(new Response("{}", { status: 500 }));
    await ask({ code: "4/secret-code" });
    const logged = JSON.stringify([
      ...errorLog.mock.calls,
      ...log.mock.calls,
      ...warn.mock.calls,
    ]);
    expect(logged).not.toContain("secret-code");
    expect(logged).not.toContain(goodToken().split(".")[1]!);
    log.mockRestore();
    warn.mockRestore();
  });
});
