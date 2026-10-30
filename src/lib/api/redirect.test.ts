import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

const origin = "https://needears.com";

describe("safeNext", () => {
  it.each([
    ["/t/my-track", "https://needears.com/t/my-track"],
    ["/settings?tab=profile", "https://needears.com/settings?tab=profile"],
    [null, "https://needears.com/"],
  ])("keeps the same-site path %s", (value, expected) => {
    expect(safeNext(value, origin).href).toBe(expected);
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "\t//evil.com",
    "javascript:alert(1)",
    "/.//evil.com",
    "/..//evil.com",
    "/%2e//evil.com",
    "/a/..//evil.com",
    "/./\\evil.com",
  ])("sends %j to the front page", (value) => {
    expect(safeNext(value, origin).href).toBe("https://needears.com/");
  });
});

describe("safeNext path", () => {
  it("never gives a path that starts with two slashes", () => {
    for (const value of ["/.//evil.com", "/a/..//evil.com", "/%2e//x"]) {
      const url = safeNext(value, origin);
      expect((url.pathname + url.search).startsWith("//")).toBe(false);
    }
  });
});
