/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/lazy", () => ({ browserClient: vi.fn() }));
vi.mock("@/lib/auth/identity-intent", () => ({
  requestIdentityIntent: vi.fn(async () => "reauth"),
}));

import { ChangeEmail } from "./change-email";

describe("ChangeEmail", () => {
  it("asks for a fresh sign-in before anything is typed", async () => {
    const user = userEvent.setup();
    render(<ChangeEmail current="nora@example.com" fresh={false} />);
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(
      screen.getByRole("heading", { name: "Sign in again first" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("New email")).toBeNull();
  });

  it("keeps the typed address when the server asks for a fresh sign-in", async () => {
    const user = userEvent.setup();
    render(<ChangeEmail current="nora@example.com" fresh />);
    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.type(screen.getByLabelText("New email"), "nora@new.example");
    await user.click(screen.getByRole("button", { name: "Send links" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in again first" }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("needears:new-email")).toBe(
      "nora@new.example",
    );
  });
});
