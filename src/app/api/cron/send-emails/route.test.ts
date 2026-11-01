import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

const { GET } = await import("./route");

const securityRow = {
  queue_id: 7,
  user_id: "11111111-1111-4111-8111-111111111111",
  recipients: ["old@example.com", "new@example.com"],
  kind: "email_changed",
  payload: { email: "new@example.com", at: "2026-11-01T12:00:00Z" },
};

function cronRequest() {
  return new Request("http://localhost/api/cron/send-emails", {
    headers: { authorization: "Bearer test-secret" },
  });
}

describe("GET /api/cron/send-emails", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "Need Ears <hello@example.com>");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    rpc.mockImplementation(async (name: string) =>
      name === "security_email_batch"
        ? { data: [securityRow], error: null }
        : { data: null, error: null },
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    rpc.mockReset();
    fetchMock.mockReset();
  });

  it("sends security emails to every address and marks them sent", async () => {
    const response = await GET(cronRequest());
    expect(await response.json()).toEqual({ sent: 1, failed: 0 });

    const to = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(init.body as string).to[0],
    );
    expect(to).toEqual(["old@example.com", "new@example.com"]);
    expect(rpc).toHaveBeenCalledWith("mark_emails_sent", {
      p_ids: [7],
      p_sends: 2,
    });
  });

  it("never asks for or sends notification emails", async () => {
    await GET(cronRequest());
    const names = rpc.mock.calls.map(([name]) => name);
    expect(names).toEqual(["security_email_batch", "mark_emails_sent"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing without the cron secret", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/send-emails"),
    );
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
