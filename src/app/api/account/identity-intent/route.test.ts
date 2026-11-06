import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const signOut = vi.fn();
const getClaims = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc, auth: { admin: { signOut } } }),
}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    supabase: { auth: { getClaims } },
    via: "bearer",
    token: "access-token",
  }),
}));

const { POST } = await import("./route");

function intent(body: unknown) {
  return POST(
    new Request("http://localhost/api/account/identity-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const SESSION = "5e550000-0000-4000-8000-000000000001";

const fresh = () => [
  { method: "magiclink", timestamp: Math.floor(Date.now() / 1000) - 60 },
];

describe("POST /api/account/identity-intent", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getClaims.mockResolvedValue({
      data: { claims: { amr: fresh(), session_id: SESSION } },
      error: null,
    });
    signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    rpc.mockReset();
    signOut.mockReset();
    getClaims.mockReset();
  });

  it("asks an old session to sign in again", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [
            {
              method: "magiclink",
              timestamp: Math.floor(Date.now() / 1000) - 3600,
            },
          ],
        },
      },
      error: null,
    });
    const response = await intent({
      action: "email_change",
      provider: "email",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "reauth_required" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes an email change intent after signing out other sessions", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data: name === "has_identity_intent" ? false : null,
      error: null,
    }));
    const pending = intent({ action: "email_change", provider: "email" });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).status).toBe(204);
    expect(signOut).toHaveBeenCalledWith("access-token", "others");
    expect(rpc).toHaveBeenCalledWith("create_identity_intent", {
      p_user: "11111111-1111-4111-8111-111111111111",
      p_action: "email_change",
      p_provider: "email",
      p_session: SESSION,
    });
  });

  it("reuses an unused email change intent without signing out again", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const response = await intent({
      action: "email_change",
      provider: "email",
    });
    expect(response.status).toBe(204);
    expect(signOut).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("has_identity_intent", {
      p_user: "11111111-1111-4111-8111-111111111111",
      p_action: "email_change",
      p_provider: "email",
      p_session: SESSION,
    });
  });

  it("without a session id, never reuses and signs out the rest", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { amr: fresh() } },
      error: null,
    });
    rpc.mockResolvedValue({ data: null, error: null });
    const pending = intent({ action: "email_change", provider: "email" });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).status).toBe(204);
    expect(rpc).not.toHaveBeenCalledWith(
      "has_identity_intent",
      expect.anything(),
    );
    expect(signOut).toHaveBeenCalledWith("access-token", "others");
    expect(rpc).toHaveBeenCalledWith("create_identity_intent", {
      p_user: "11111111-1111-4111-8111-111111111111",
      p_action: "email_change",
      p_provider: "email",
      p_session: undefined,
    });
  });

  it("refuses mixed actions and providers", async () => {
    for (const body of [
      { action: "email_change", provider: "google" },
      { action: "link", provider: "email" },
    ]) {
      expect((await intent(body)).status).toBe(400);
    }
  });
});
