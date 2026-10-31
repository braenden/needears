import { describe, expect, it } from "vitest";
import { renderSecurityEmail } from "./security";

describe("renderSecurityEmail", () => {
  it("tells the person a sign in method was added", () => {
    const email = renderSecurityEmail(
      "identity_linked",
      { provider: "google", email: "nora@example.com" },
      "https://needears.com",
      "contact@needears.com",
    );
    expect(email.subject).toBe(
      "A new way to sign in was added to your account",
    );
    expect(email.text).toContain("Google (nora@example.com) can now be used");
    expect(email.text).toContain("https://needears.com/settings");
    expect(email.text).toContain("contact@needears.com");
  });

  it("tells the person a sign in method was removed", () => {
    const email = renderSecurityEmail(
      "identity_unlinked",
      { provider: "email", email: "nora@example.com" },
      "https://needears.com",
      "contact@needears.com",
    );
    expect(email.subject).toBe(
      "A way to sign in was removed from your account",
    );
    expect(email.text).toContain("can no longer be used");
  });

  it("keeps provider data out of the HTML", () => {
    const email = renderSecurityEmail(
      "identity_linked",
      { provider: "<script>", email: "x@y.z<img src=x>" },
      "https://needears.com",
      "contact@needears.com",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.text).toContain("Another provider (x@y.zimgsrcx)");
  });
});
