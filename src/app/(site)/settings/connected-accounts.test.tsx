/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserIdentity } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
);
vi.mock("sonner", () => ({ toast }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const auth = vi.hoisted(() => ({
  linkIdentity: vi.fn(),
  unlinkIdentity: vi.fn(),
}));
vi.mock("@/lib/supabase/lazy", () => ({
  browserClient: async () => ({ auth }),
}));
// Google's button needs Google; a stand-in hands over a token when pressed.
const outcome = vi.hoisted(() => ({ done: null as boolean | null }));
vi.mock("@/components/auth/google-id-button", () => ({
  GoogleGlyph: () => null,
  GoogleIdButton: ({
    onCredential,
  }: {
    onCredential: (token: string, nonce: string) => Promise<boolean>;
  }) => (
    <button
      type="button"
      onClick={async () => {
        outcome.done = await onCredential("id-token", "raw-nonce");
      }}
    >
      Google button
    </button>
  ),
}));

const {
  ConnectedAccounts,
  disconnectText,
  linkErrorText,
  REAUTH_TO_CONNECT,
  unlinkErrorText,
} = await import("./connected-accounts");

const identity = (provider: string, email: string): UserIdentity => ({
  id: `${provider}-id`,
  identity_id: `${provider}-identity`,
  user_id: "user",
  provider,
  identity_data: { email },
});
const email = identity("email", "nora@example.com");
const google = identity("google", "nora.k@gmail.com");

const card = (
  identities: UserIdentity[],
  options: Partial<{ fresh: boolean; googleClientId: string | null }> = {},
) => (
  <ConnectedAccounts
    identities={identities}
    accountEmail="nora@example.com"
    googleClientId={
      "googleClientId" in options ? options.googleClientId! : "id.apps"
    }
    fresh={options.fresh ?? true}
  />
);

// POST /api/account/identity-intent
const intent = vi.fn();
const intentAnswers = {
  ok: () => new Response(null, { status: 204 }),
  reauth: () => Response.json({ error: "reauth_required" }, { status: 403 }),
  broken: () => new Response(null, { status: 500 }),
};

beforeEach(() => {
  vi.clearAllMocks();
  outcome.done = null;
  intent.mockImplementation(async () => intentAnswers.ok());
  vi.stubGlobal("fetch", intent);
});

const intentBody = () =>
  JSON.parse((intent.mock.calls[0]![1] as RequestInit).body as string);

describe("connecting Google", () => {
  it("links the ID token and nonce from Google's button", async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(card([email]));
    expect(screen.getByText("nora@example.com")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Google button" }));
    await waitFor(() => expect(outcome.done).toBe(true));
    expect(intent.mock.calls[0]![0]).toBe("/api/account/identity-intent");
    expect(intentBody()).toEqual({ action: "link", provider: "google" });
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      token: "id-token",
      nonce: "raw-nonce",
    });
    expect(toast.success).toHaveBeenCalledWith("Google connected.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("explains a Google account that belongs to someone else", async () => {
    auth.linkIdentity.mockResolvedValue({
      data: {},
      error: { code: "identity_already_exists" },
    });
    const user = userEvent.setup();
    render(card([email]));
    await user.click(screen.getByRole("button", { name: "Google button" }));
    await waitFor(() => expect(outcome.done).toBe(false));
    expect(toast.error).toHaveBeenCalledWith(
      "That Google account already belongs to another profile.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("asks for a fresh sign-in first when the last one is old", () => {
    render(card([email], { fresh: false }));
    expect(screen.queryByRole("button", { name: "Google button" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Connect Google" }),
    ).toHaveAttribute("href", REAUTH_TO_CONNECT);
    expect(screen.getByText(/sign in again first/)).toBeInTheDocument();
  });

  it("sends people to sign in again when the server says so", async () => {
    intent.mockImplementation(async () => intentAnswers.reauth());
    const user = userEvent.setup();
    render(card([email]));
    await user.click(screen.getByRole("button", { name: "Google button" }));
    await waitFor(() => expect(outcome.done).toBe(true));
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(REAUTH_TO_CONNECT);
  });

  it("does not link when the server cannot give the go-ahead", async () => {
    intent.mockImplementation(async () => intentAnswers.broken());
    const user = userEvent.setup();
    render(card([email]));
    await user.click(screen.getByRole("button", { name: "Google button" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it("offers nothing to connect when Google sign-in is not set up", () => {
    render(card([email], { googleClientId: null }));
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Google button" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Connect Google" })).toBeNull();
  });
});

describe("disconnecting Google", () => {
  it("confirms, unlinks and refreshes", async () => {
    auth.unlinkIdentity.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(card([email, google]));
    expect(screen.getByText("nora.k@gmail.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "You can no longer sign in with nora.k@gmail.com",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Disconnect" }).at(-1)!,
    );
    await waitFor(() =>
      expect(auth.unlinkIdentity).toHaveBeenCalledWith(google),
    );
    expect(intentBody()).toEqual({ action: "unlink", provider: "google" });
    expect(toast.success).toHaveBeenCalledWith("Google disconnected.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("explains the day's wait right after connecting", async () => {
    auth.unlinkIdentity.mockResolvedValue({
      data: null,
      error: { code: "unexpected_failure" },
    });
    const user = userEvent.setup();
    const justNow = { ...google, created_at: new Date().toISOString() };
    render(card([email, justNow]));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(
      screen.getAllByRole("button", { name: "Disconnect" }).at(-1)!,
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/for a day after a new one was connected/),
      ),
    );
  });

  it("does not let Google go when it is the only way in", () => {
    render(card([google]));
    expect(screen.getByText("Not set up")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Disconnect" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      /Add a way to sign in with email first/,
    );
  });
});

describe("texts", () => {
  it("say what disconnecting does", () => {
    expect(disconnectText("nora.k@gmail.com", "nora@example.com")).toMatch(
      /^You can no longer sign in with nora.k@gmail.com/,
    );
    // Same address: Supabase connects it again at the next Google sign-in.
    expect(disconnectText("Nora@Example.com", "nora@example.com")).toMatch(
      /keeps working: it connects again by itself/,
    );
  });

  it("explain why connecting failed", () => {
    expect(linkErrorText("identity_already_exists")).toBe(
      "That Google account already belongs to another profile.",
    );
    expect(linkErrorText("manual_linking_disabled")).toBe(
      "Connecting a Google account isn't available right now.",
    );
    expect(linkErrorText(undefined)).toMatch(/Couldn't connect Google/);
    // Errors from our database arrive wrapped, so they get the general text.
    expect(linkErrorText("server_error")).toMatch(/Couldn't connect Google/);
  });
});

describe("unlinkErrorText", () => {
  const at = (iso: string) => ({ ...google, created_at: iso });
  const now = Date.parse("2026-11-02T12:00:00Z");

  it("explains the day's wait after a new connection", () => {
    expect(unlinkErrorText([email, at("2026-11-02T08:00:00Z")], now)).toMatch(
      /Try again tomorrow/,
    );
  });

  it("is general otherwise", () => {
    expect(unlinkErrorText([email, at("2026-10-20T08:00:00Z")], now)).toBe(
      "Couldn't disconnect Google. Try again, or come back in a minute.",
    );
  });
});
