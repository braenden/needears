import { describe, expect, it } from "vitest";

import { aborted, describeError } from "./errors";

describe("query errors", () => {
  it("knows a request cut off by leaving the page", () => {
    expect(
      aborted({ message: "AbortError: This operation was aborted", code: "" }),
    ).toBe(true);
    expect(aborted({ message: "permission denied", code: "42501" })).toBe(
      false,
    );
  });

  it("logs the message, also when there is no code", () => {
    expect(describeError({ message: "TypeError: fetch failed" })).toBe(
      "TypeError: fetch failed",
    );
    expect(describeError({ code: "42501", message: "permission denied" })).toBe(
      "42501 permission denied",
    );
    expect(describeError({})).toBe("unknown");
  });
});
