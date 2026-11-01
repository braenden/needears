/** @vitest-environment jsdom */
import { useEffect, useRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("says which way was used last, only when there is a choice", async () => {
    localStorage.setItem("needears:last-login", "email");
    const { unmount } = render(<LoginForm next="/" googleClientId="id.apps" />);
    expect(
      screen.getByText("You signed in with email last time."),
    ).toBeInTheDocument();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    unmount();

    render(<LoginForm next="/" googleClientId={null} />);
    expect(screen.queryByText(/last time/)).toBeNull();
    localStorage.clear();
  });

  it("says so outside Google's button when Google was used last", async () => {
    localStorage.setItem("needears:last-login", "google");
    render(<LoginForm next="/" googleClientId="id.apps" />);
    const hint = screen.getByText("You signed in with Google last time.");
    expect(
      screen.getByTestId("google-button").parentElement?.contains(hint),
    ).toBe(false);
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    localStorage.clear();
  });

  it("shows one message in place of both ways in while signing in", async () => {
    let finish: (value: unknown) => void = () => {};
    signInWithIdToken.mockReturnValue(new Promise((r) => (finish = r)));
    render(<LoginForm next="/" googleClientId="id.apps" />);
    await waitFor(() => expect(configs).toHaveLength(1));
    configs[0]!.callback({ credential: "id-token" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Signing you in…",
    );
    // Both buttons are out of sight, and nothing is drawn over Google's.
    expect(
      screen.queryByRole("button", { name: "Email me a sign-in link" }),
    ).toBeNull();
    expect(
      screen
        .getByTestId("google-button")
        .parentElement?.contains(screen.getByRole("status")),
    ).toBe(false);

    // Supabase refuses: both come back, and Google's button gets a new nonce.
    finish({ data: { user: null }, error: { message: "nope" } });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(configs).toHaveLength(2));
  });

  it("draws the button again when Google draws it too narrow", async () => {
    // Google's first drawing comes out narrower than asked for, like the
    // personalized button after a client-side navigation.
    renderButton.mockImplementation((parent: HTMLElement) => {
      const button = document.createElement("div");
      button.getBoundingClientRect = () =>
        ({
          width: renderButton.mock.calls.length === 1 ? 120 : 200,
        }) as DOMRect;
      parent.appendChild(button);
    });
    render(<GoogleButton clientId="id.apps" next="/" onError={() => {}} />);
    await waitFor(() => expect(renderButton).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(renderButton).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });
    renderButton.mockReset();
  });

  it("leaves the button alone once someone is on it", async () => {
    // Narrow every time, so the checks would redraw it if they could.
    renderButton.mockImplementation((parent: HTMLElement) => {
      const button = document.createElement("div");
      button.getBoundingClientRect = () => ({ width: 120 }) as DOMRect;
      parent.appendChild(button);
    });
    render(<GoogleButton clientId="id.apps" next="/" onError={() => {}} />);
    await waitFor(() => expect(renderButton).toHaveBeenCalledTimes(1));
    // The pointer moves onto Google's button (its popup may open now).
    fireEvent.pointerOver(screen.getByTestId("google-button").firstChild!);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(renderButton).toHaveBeenCalledTimes(1);
    renderButton.mockReset();
  });

  it("stops waiting for a width when it leaves the page", async () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    // jsdom has no layout, so the container is 0 wide and draw waits.
    const { unmount } = render(
      <GoogleButton clientId="id.apps" next="/" onError={() => {}} />,
    );
    await waitFor(() => expect(observe).toHaveBeenCalled());
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(renderButton).not.toHaveBeenCalled();
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
