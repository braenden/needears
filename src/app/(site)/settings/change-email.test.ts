import { describe, expect, it } from "vitest";

import { emailChangeError } from "./change-email";

describe("emailChangeError", () => {
  it("never asks for a fresh sign-in itself: that is our server's answer", () => {
    expect(emailChangeError({ status: 500, code: "unexpected_failure" })).toBe(
      "We couldn't send the email. Try again in a minute.",
    );
  });

  it("does not say whether an address has an account or too many emails went out", () => {
    expect(emailChangeError({ status: 422, code: "email_exists" })).toBe(
      "We can't use that address. Try another one.",
    );
    expect(
      emailChangeError({ status: 429, code: "over_email_send_rate_limit" }),
    ).toBe("Too many emails. Wait a minute and try again.");
  });
});
