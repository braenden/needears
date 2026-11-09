/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GoogleCodeResponse,
  GoogleOAuth2,
} from "@/components/auth/google-code-client";
import { POPUP_BLOCKED } from "@/components/auth/google-code-client";
import { createRawNonce, destinationAfterSignIn } from "@/lib/auth/google-id";
import { signedInHash, signedInWithEmail } from "@/lib/auth/last-login";

const signInWithIdToken = vi.fn();
vi.mock("@/lib/supabase/lazy", () => ({
  browserClient: async () => ({ auth: { signInWithIdToken } }),
}));
vi.mock("next/script", () => ({ default: () => null }));

const { GoogleButton, GOOGLE_FAILED, GOOGLE_UNAVAILABLE } =
  await import("./google-button");
const { LoginForm } = await import("./login-form");

type CodeConfig = Parameters<GoogleOAuth2["initCodeClient"]>[0];

// Google's code client: a stand-in answers the popup the way Google would.
let config: CodeConfig | null = null;
let answer: (config: CodeConfig) => GoogleCodeResponse | "blocked" = (c) => ({
  code: "4/google-code",
  state: c.state,
});
const assign = vi.fn();
const fetchMock = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  signInWithIdToken.mockReset();
  assign.mockReset();
  fetchMock.mockReset();
  localStorage.clear();
  config = null;
  answer = (c) => ({ code: "4/google-code", state: c.state });
  window.google = {
    accounts: {
      oauth2: {
        initCodeClient: (c) => {
          config = c;
          return {
            requestCode: () => {
              const response = answer(c);
              if (response === "blocked")
                c.error_callback?.({ type: "popup_failed_to_open" });
              else c.callback(response);
            },
          };
        },
      },
    },
  };
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { origin: realLocation.origin, assign },
  });
  fetchMock.mockResolvedValue(
    Response.json({ idToken: "google-id-token" }, { status: 200 }),
  );
  signInWithIdToken.mockResolvedValue({
    data: { user: { user_metadata: { onboarded: true } } },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
  delete window.google;
});

const lastLogin = () => localStorage.getItem("needears:last-login");

function renderButton(props: Partial<Parameters<typeof GoogleButton>[0]> = {}) {
  const onError = vi.fn();
  render(
    <GoogleButton
      clientId="id.apps"
      next="/upload"
      onError={onError}
      {...props}
    />,
  );
  return {
    onError,
    button: screen.getByRole("button", { name: "Continue with Google" }),
  };
}

describe("nonces and destinations", () => {
  it("makes a fresh nonce each time", () => {
    expect(createRawNonce()).not.toBe(createRawNonce());
  });

  it("sends new people to /welcome first", () => {
    expect(destinationAfterSignIn(null, "/upload")).toBe(
      "/welcome?next=%2Fupload",
    );
    expect(
      destinationAfterSignIn({ user_metadata: { onboarded: true } }, "/feed"),
    ).toBe("/feed");
  });
});

describe("the way in, after an email link worked", () => {
  it("is read back from the hash /auth/callback adds", () => {
    expect(signedInWithEmail(signedInHash())).toBe(true);
    expect(signedInWithEmail("#signed-in=google")).toBe(false);
    expect(signedInWithEmail("")).toBe(false);
  });
});

describe("GoogleButton", () => {
  it("opens Google's popup, swaps the code on our server and signs in", async () => {
    const user = userEvent.setup();
    const { onError } = renderButton();
    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(config).toMatchObject({
      client_id: "id.apps",
      ux_mode: "popup",
      scope: "openid email profile",
      select_account: false,
    });
    expect(config?.state).toMatch(/^[\w-]{40,}$/);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/upload"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/google-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "4/google-code" }),
    });
    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "google-id-token",
    });
    expect(lastLogin()).toBe("google");
    expect(onError).toHaveBeenLastCalledWith(null);
  });

  it("sends a new account to /welcome first", async () => {
    const user = userEvent.setup();
    signInWithIdToken.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });
    const { button } = renderButton();
    await user.click(button);
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/welcome?next=%2Fupload"),
    );
  });

  it("asks which account when signing in again", async () => {
    const user = userEvent.setup();
    const { button } = renderButton({ chooseAccount: true });
    await user.click(button);
    expect(config?.select_account).toBe(true);
  });

  it("uses a new state each time and drops an answer that does not match", async () => {
    const user = userEvent.setup();
    answer = () => ({ code: "4/google-code", state: "someone-else" });
    const { button, onError } = renderButton();
    await user.click(button);
    expect(onError).toHaveBeenLastCalledWith(GOOGLE_FAILED);
    const first = config?.state;
    await user.click(button);
    expect(config?.state).not.toBe(first);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lastLogin()).toBeNull();
  });

  it("remembers nothing when our server turns the code down", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      Response.json({ error: { code: "invalid_code" } }, { status: 400 }),
    );
    const { button, onError } = renderButton();
    await user.click(button);
    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(GOOGLE_FAILED),
    );
    expect(signInWithIdToken).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(lastLogin()).toBeNull();
    expect(button).toBeEnabled();
  });

  it("remembers nothing when Supabase does not sign in", async () => {
    const user = userEvent.setup();
    signInWithIdToken.mockResolvedValue({
      data: { user: null },
      error: new Error("no"),
    });
    const { button, onError } = renderButton();
    await user.click(button);
    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(GOOGLE_FAILED),
    );
    expect(assign).not.toHaveBeenCalled();
    expect(lastLogin()).toBeNull();
  });

  it("says so when Google's script is not there", async () => {
    const user = userEvent.setup();
    delete window.google;
    const { button, onError } = renderButton();
    await user.click(button);
    expect(onError).toHaveBeenLastCalledWith(GOOGLE_UNAVAILABLE);
    expect(button).toBeEnabled();
  });

  it("takes closing Google's window as a change of mind", async () => {
    const user = userEvent.setup();
    answer = () => ({ error: "access_denied" });
    const { button, onError } = renderButton();
    await user.click(button);
    expect(onError).toHaveBeenLastCalledWith(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says so when the browser blocks the popup", async () => {
    const user = userEvent.setup();
    answer = () => "blocked";
    const { button, onError } = renderButton();
    await user.click(button);
    expect(onError).toHaveBeenLastCalledWith(POPUP_BLOCKED);
  });
});

describe("LoginForm", () => {
  it("offers only the email link without a client ID", () => {
    render(<LoginForm next="/" googleClientId={null} />);
    expect(screen.queryByTestId("google-button")).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue with email" }),
    ).toBeInTheDocument();
  });

  it("offers Google first when a client ID is set", () => {
    render(<LoginForm next="/" googleClientId="id.apps" />);
    const google = screen.getByRole("button", { name: "Continue with Google" });
    const email = screen.getByRole("button", { name: "Continue with email" });
    expect(
      google.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("says which way was used last, only when there is a choice", () => {
    localStorage.setItem("needears:last-login", "google");
    const { unmount } = render(<LoginForm next="/" googleClientId="id.apps" />);
    expect(
      screen.getByText("You signed in with Google last time."),
    ).toBeInTheDocument();
    unmount();

    render(<LoginForm next="/" googleClientId={null} />);
    expect(screen.queryByText(/last time/)).toBeNull();
  });

  it("keeps the email field's label for screen readers", () => {
    render(<LoginForm next="/" googleClientId={null} />);
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "placeholder",
      "Email address",
    );
  });
});
