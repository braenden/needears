/** @vitest-environment jsdom */
import { useEffect, useRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRawNonce,
  destinationAfterSignIn,
  hashNonce,
} from "@/lib/auth/google-id";

// The script tag does nothing in jsdom; pretend it loaded. Like the real
// one, onReady runs once per mount.
vi.mock("next/script", () => ({
  default: function Script({ onReady }: { onReady?: () => void }) {
    const called = useRef(false);
    useEffect(() => {
      if (called.current) return;
      called.current = true;
      onReady?.();
    });
    return null;
  },
}));

const signInWithIdToken = vi.fn();
vi.mock("@/lib/supabase/lazy", () => ({
  browserClient: async () => ({ auth: { signInWithIdToken } }),
}));

const { GoogleButton } = await import("./google-button");
const { LoginForm } = await import("./login-form");

type Config = {
  client_id: string;
  nonce: string;
  callback: (response: { credential?: string }) => void;
};

let configs: Config[] = [];
const renderButton = vi.fn();
const assign = vi.fn();

beforeEach(() => {
  configs = [];
  renderButton.mockClear();
  signInWithIdToken.mockReset();
  assign.mockClear();
  window.google = {
    accounts: {
      id: {
        initialize: (config) => configs.push(config as Config),
        renderButton,
      },
    },
  };
  vi.stubGlobal("location", { ...window.location, assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.google;
});

describe("nonces", () => {
  it("are random and hash to 64 hex characters", async () => {
    const raw = createRawNonce();
    expect(raw).not.toBe(createRawNonce());
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await hashNonce("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("send new people to /welcome first", () => {
    expect(destinationAfterSignIn({ user_metadata: {} }, "/t/x?t=3")).toBe(
      "/welcome?next=%2Ft%2Fx%3Ft%3D3",
    );
    expect(
      destinationAfterSignIn({ user_metadata: { onboarded: true } }, "/feed"),
    ).toBe("/feed");
  });
});

describe("GoogleButton", () => {
  it("gives Google the hash and Supabase the raw nonce", async () => {
    signInWithIdToken.mockResolvedValue({
      data: { user: { user_metadata: { onboarded: true } } },
      error: null,
    });
    render(
      <GoogleButton clientId="id.apps" next="/upload" onError={() => {}} />,
    );
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    const config = configs[0]!;
    expect(config.client_id).toBe("id.apps");
    expect(config.nonce).toMatch(/^[0-9a-f]{64}$/);

    config.callback({ credential: "id-token" });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/upload"));
    const sent = signInWithIdToken.mock.calls[0]![0] as {
      provider: string;
      token: string;
      nonce: string;
    };
    expect(sent.provider).toBe("google");
    expect(sent.token).toBe("id-token");
    expect(await hashNonce(sent.nonce)).toBe(config.nonce);
  });

  it("says so and starts over with a new nonce when Supabase refuses", async () => {
    signInWithIdToken.mockResolvedValue({
      data: { user: null },
      error: new Error("nonce mismatch"),
    });
    const onError = vi.fn();
    render(<GoogleButton clientId="id.apps" next="/" onError={onError} />);
    await waitFor(() => expect(configs).toHaveLength(1));
    configs[0]!.callback({ credential: "id-token" });
    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(
        expect.stringContaining("didn't work"),
      ),
    );
    await waitFor(() => expect(configs).toHaveLength(2));
    expect(configs[1]!.nonce).not.toBe(configs[0]!.nonce);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("LoginForm", () => {
  it("offers only the email link without a client ID", () => {
    render(<LoginForm next="/" googleClientId={null} />);
    expect(screen.queryByTestId("google-button")).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeInTheDocument();
  });

  it("marks the method used last, only when there is a choice", async () => {
    localStorage.setItem("needears:last-login", "email");
    const { unmount } = render(<LoginForm next="/" googleClientId="id.apps" />);
    expect(screen.getByText("Last used")).toBeInTheDocument();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    unmount();

    render(<LoginForm next="/" googleClientId={null} />);
    expect(screen.queryByText("Last used")).toBeNull();
    localStorage.clear();
  });

  it("marks Google on the edge of its button", async () => {
    localStorage.setItem("needears:last-login", "google");
    render(<LoginForm next="/" googleClientId="id.apps" />);
    const badge = screen.getByText("Last used");
    expect(
      badge.parentElement?.querySelector('[data-testid="google-button"]'),
    ).not.toBeNull();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    localStorage.clear();
  });

  it("remembers Google once the token is accepted", async () => {
    localStorage.clear();
    signInWithIdToken.mockResolvedValue({
      data: { user: { user_metadata: { onboarded: true } } },
      error: null,
    });
    render(<GoogleButton clientId="id.apps" next="/" onError={() => {}} />);
    await waitFor(() => expect(configs).toHaveLength(1));
    configs[0]!.callback({ credential: "id-token" });
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(localStorage.getItem("needears:last-login")).toBe("google");
  });

  it("offers Google first when a client ID is set", async () => {
    render(<LoginForm next="/" googleClientId="id.apps" />);
    expect(screen.getByTestId("google-button")).toBeInTheDocument();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
  });
});
