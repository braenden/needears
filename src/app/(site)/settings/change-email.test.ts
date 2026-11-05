import { describe, expect, it } from "vitest";

import { emailChangeError } from "./change-email";

describe("emailChangeError", () => {
  it("asks for a fresh sign-in when the go-ahead is missing or used up", () => {
    expect(emailChangeError({ status: 403, code: "reauth_required" })).toBe(
      "reauth",
    );
    expect(emailChangeError({ status: 500, code: "unexpected_failure" })).toBe(
      "reauth",
    );
  });

  it("says when the address is taken or too many emails went out", () => {
    expect(emailChangeError({ status: 422, code: "email_exists" })).toBe(
      "That address belongs to another account.",
    );
    expect(
      emailChangeError({ status: 429, code: "over_email_send_rate_limit" }),
    ).toBe("Too many emails. Wait a minute and try again.");
  });
});
