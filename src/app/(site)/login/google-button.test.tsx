/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRawNonce, destinationAfterSignIn } from "@/lib/auth/google-id";
import { signedInHash, signedInMethod } from "@/lib/auth/last-login";

const signInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/lazy", () => ({
  browserClient: async () => ({ auth: { signInWithOAuth } }),
}));

const { GoogleButton } = await import("./google-button");
const { LoginForm } = await import("./login-form");

beforeEach(() => {
  signInWithOAuth.mockReset();
  localStorage.clear();
});

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

describe("the way in, after a sign-in that worked", () => {
  it("is read back from the hash /auth/callback adds", () => {
    expect(signedInMethod(signedInHash("google"))).toBe("google");
    expect(signedInMethod(signedInHash("email"))).toBe("email");
    expect(signedInMethod("#signed-in=password")).toBeNull();
    expect(signedInMethod("")).toBeNull();
  });
});

describe("GoogleButton", () => {
  it("goes to Google through Supabase and back to the callback", async () => {
    const user = userEvent.setup();
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    render(<GoogleButton next="/upload" onError={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fupload&via=google`,
      },
    });
  });

  it("says so, and can be tried again, when it cannot start", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    signInWithOAuth.mockResolvedValue({ data: {}, error: new Error("no") });
    render(<GoogleButton next="/" onError={onError} />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    await user.click(button);
    expect(onError).toHaveBeenLastCalledWith(
      "Google sign-in isn't available right now. Try the email link.",
    );
    expect(button).toBeEnabled();
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
