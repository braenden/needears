/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserIdentity } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const auth = vi.hoisted(() => ({
  linkIdentity: vi.fn(),
  unlinkIdentity: vi.fn(),
}));
vi.mock("@/lib/supabase/lazy", () => ({
  browserClient: async () => ({ auth }),
}));

const { ConnectedAccounts, linkErrorText } =
  await import("./connected-accounts");

const identity = (provider: string, email: string): UserIdentity => ({
  id: `${provider}-id`,
  identity_id: `${provider}-identity`,
  user_id: "user",
  provider,
  identity_data: { email },
});
const email = identity("email", "nora@example.com");
const google = identity("google", "nora.k@gmail.com");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConnectedAccounts", () => {
  it("offers to connect Google to an email account", () => {
    render(<ConnectedAccounts identities={[email]} />);
    expect(screen.getByText("nora@example.com")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Google" }),
    ).toBeEnabled();
  });

  it("shows the Google address and lets it be disconnected", async () => {
    auth.unlinkIdentity.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<ConnectedAccounts identities={[email, google]} />);
    expect(screen.getByText("nora.k@gmail.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("nora@example.com");
    await user.click(
      screen.getAllByRole("button", { name: "Disconnect" }).at(-1)!,
    );
    await waitFor(() =>
      expect(auth.unlinkIdentity).toHaveBeenCalledWith(google),
    );
    expect(toast.success).toHaveBeenCalledWith("Google disconnected.");
    expect(refresh).toHaveBeenCalled();
  });

  it("does not let Google go when it is the only way in", () => {
    render(<ConnectedAccounts identities={[google]} />);
    expect(screen.getByText("Not set up")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Disconnect" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      /Add a way to sign in with email first/,
    );
  });

  it("connects through Supabase and back to Settings", async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<ConnectedAccounts identities={[email]} />);
    await user.click(screen.getByRole("button", { name: "Connect Google" }));
    const call = auth.linkIdentity.mock.calls[0]![0] as {
      provider: string;
      options: { redirectTo: string };
    };
    expect(call.provider).toBe("google");
    const back = new URL(call.options.redirectTo);
    expect(back.pathname).toBe("/auth/callback");
    expect(back.searchParams.get("next")).toBe("/settings?linked=google");
  });

  it("says so when connecting is refused at once", async () => {
    auth.linkIdentity.mockResolvedValue({
      data: {},
      error: { code: "manual_linking_disabled" },
    });
    const user = userEvent.setup();
    render(<ConnectedAccounts identities={[email]} />);
    await user.click(screen.getByRole("button", { name: "Connect Google" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Connecting a Google account isn't available right now.",
      ),
    );
  });

  it("tells how it went after coming back, and cleans the address", () => {
    window.history.replaceState(null, "", "/settings?linked=google");
    render(<ConnectedAccounts identities={[email, google]} linked />);
    expect(toast.success).toHaveBeenCalledWith("Google connected.");
    expect(window.location.search).toBe("");

    window.history.replaceState(
      null,
      "",
      "/settings?link_error=identity_already_exists",
    );
    render(
      <ConnectedAccounts
        identities={[email]}
        linkError="identity_already_exists"
      />,
    );
    expect(toast.error).toHaveBeenCalledWith(
      "That Google account already belongs to another profile.",
    );
    expect(window.location.search).toBe("");
  });
});

describe("linkErrorText", () => {
  it("explains the common failures", () => {
    expect(linkErrorText("identity_already_exists")).toBe(
      "That Google account already belongs to another profile.",
    );
    expect(linkErrorText("access_denied")).toMatch(/wasn't connected/);
    expect(linkErrorText("something_else")).toMatch(/Couldn't connect Google/);
  });
});
