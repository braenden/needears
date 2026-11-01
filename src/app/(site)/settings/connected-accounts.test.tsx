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
  unlinkIdentity: vi.fn(),
}));
vi.mock("@/lib/supabase/lazy", () => ({
  browserClient: async () => ({ auth }),
}));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@/components/auth/google-id-button", () => ({
  GoogleGlyph: () => null,
  GSI_SCRIPT: "https://accounts.google.com/gsi/client",
}));

// Google's code client: a stand-in answers the popup the way Google would.
type CodeConfig = {
  client_id: string;
  scope: string;
  select_account: boolean;
  state: string;
  callback: (response: {
    code?: string;
    state?: string;
    error?: string;
  }) => void;
  error_callback?: (error: { type?: string }) => void;
};
const popup = vi.hoisted(() => ({
  config: null as CodeConfig | null,
  answer: "code" as "code" | "wrong-state" | "denied" | "blocked",
}));
function installGoogle() {
  window.google = {
    accounts: {
      id: {} as never,
      oauth2: {
        initCodeClient: (config) => {
          popup.config = config as CodeConfig;
          return {
            requestCode: () => {
              const c = popup.config!;
              if (popup.answer === "blocked")
                c.error_callback?.({ type: "popup_failed_to_open" });
              else if (popup.answer === "denied")
                c.callback({ error: "access_denied", state: c.state });
              else
                c.callback({
                  code: "google-code",
                  state: popup.answer === "code" ? c.state : "other",
                });
            },
          };
        },
      },
    },
  };
}

const {
  ConnectedAccounts,
  disconnectText,
  linkErrorText,
  POPUP_BLOCKED,
  REAUTH_TO_CONNECT,
  SIGNS_OUT_ELSEWHERE,
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

// POST /api/account/identity-intent, then POST /api/account/google-link.
const answers = {
  ok: () => new Response(null, { status: 204 }),
  reauth: () =>
    Response.json({ error: { code: "reauth_required" } }, { status: 403 }),
  taken: () =>
    Response.json(
      { error: { code: "identity_already_exists" } },
      { status: 422 },
    ),
  broken: () => new Response(null, { status: 500 }),
};
const server = vi.fn();
const routes = { intent: answers.ok, link: answers.ok };

beforeEach(() => {
  vi.clearAllMocks();
  popup.config = null;
  popup.answer = "code";
  routes.intent = answers.ok;
  routes.link = answers.ok;
  server.mockImplementation(async (url: string) =>
    url === "/api/account/identity-intent" ? routes.intent() : routes.link(),
  );
  vi.stubGlobal("fetch", server);
  installGoogle();
});

const calls = () =>
  server.mock.calls.map(([url, init]) => [
    url,
    JSON.parse((init as RequestInit).body as string),
  ]);

describe("connecting Google", () => {
  it("opens Google's account chooser and sends the code to our server", async () => {
    const user = userEvent.setup();
    render(card([email]));
    expect(screen.getByText("nora@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(popup.config).toMatchObject({
      client_id: "id.apps",
      scope: "openid email profile",
      select_account: true,
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Google connected."),
    );
    expect(calls()).toEqual([
      ["/api/account/identity-intent", { action: "link", provider: "google" }],
      ["/api/account/google-link", { code: "google-code" }],
    ]);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("explains a Google account that belongs to someone else", async () => {
    routes.link = answers.taken;
    const user = userEvent.setup();
    render(card([email]));
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "That Google account already belongs to another profile.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("ignores an answer that was not for this click", async () => {
    popup.answer = "wrong-state";
    const user = userEvent.setup();
    render(card([email]));
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(server).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(linkErrorText(undefined));
  });

  it("says nothing when the person cancels in Google's window", async () => {
    popup.answer = "denied";
    const user = userEvent.setup();
    render(card([email]));
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(server).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("explains a blocked popup", async () => {
    popup.answer = "blocked";
    const user = userEvent.setup();
    render(card([email]));
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(toast.error).toHaveBeenCalledWith(POPUP_BLOCKED);
  });

  it("asks for a fresh sign-in first when the last one is old", () => {
    render(card([email], { fresh: false }));
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute(
      "href",
      REAUTH_TO_CONNECT,
    );
    expect(screen.getByText(/sign in again first/)).toBeInTheDocument();
  });

  it("sends people to sign in again when the server says so", async () => {
    routes.intent = answers.reauth;
    const user = userEvent.setup();
    render(card([email]));
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(REAUTH_TO_CONNECT),
    );
    expect(server).toHaveBeenCalledTimes(1);
  });

  it("does not link when the server cannot give the go-ahead", async () => {
    routes.intent = answers.broken;
    const user = userEvent.setup();
    render(card([email]));
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(server).toHaveBeenCalledTimes(1);
  });

  it("offers nothing to connect when Google is not set up", () => {
    render(card([email], { googleClientId: null }));
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Connect" })).toBeNull();
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
    expect(calls()).toEqual([
      [
        "/api/account/identity-intent",
        { action: "unlink", provider: "google" },
      ],
    ]);
    expect(toast.success).toHaveBeenCalledWith("Google disconnected.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("explains the day's wait right after connecting", async () => {
    auth.unlinkIdentity.mockResolvedValue({
      data: null,
      error: { code: "unexpected_failure" },
    });
    const user = userEvent.setup();
    // Google uses the account's own address, and the email link was added
    // a moment ago.
    const sameAddress = identity("google", "nora@example.com");
    const newEmail = { ...email, created_at: new Date().toISOString() };
    render(card([newEmail, sameAddress]));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(
      screen.getAllByRole("button", { name: "Disconnect" }).at(-1)!,
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/for a day after another one was added/),
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
  const now = Date.parse("2026-11-02T12:00:00Z");
  const sameAddress = identity("google", "nora@example.com");
  const emailAt = (iso: string) => ({ ...email, created_at: iso });

  it("explains the day's wait for the account's own address", () => {
    expect(
      unlinkErrorText(
        [emailAt("2026-11-02T08:00:00Z"), sameAddress],
        sameAddress,
        "nora@example.com",
        now,
      ),
    ).toMatch(/Try again tomorrow/);
  });

  it("is general for another address, or after the day", () => {
    const general =
      "Couldn't disconnect Google. Try again, or come back in a minute.";
    expect(
      unlinkErrorText(
        [emailAt("2026-11-02T08:00:00Z"), google],
        google,
        "nora@example.com",
        now,
      ),
    ).toBe(general);
    expect(
      unlinkErrorText(
        [emailAt("2026-10-20T08:00:00Z"), sameAddress],
        sameAddress,
        "nora@example.com",
        now,
      ),
    ).toBe(general);
  });
});

describe("signing out elsewhere", () => {
  it("is said before connecting or disconnecting", async () => {
    const { unmount } = render(card([email]));
    expect(screen.getByText(SIGNS_OUT_ELSEWHERE)).toBeInTheDocument();
    unmount();
    const user = userEvent.setup();
    render(card([email, google]));
    expect(screen.getByText(SIGNS_OUT_ELSEWHERE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "signed out on your other devices",
    );
  });
});
