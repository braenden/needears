import { describe, expect, it } from "vitest";

import { linkError, withHttps } from "./link-hosts";

describe("withHttps", () => {
  it("adds https:// to a link pasted without it", () => {
    expect(withHttps("instagram.com/alexbeats")).toBe(
      "https://instagram.com/alexbeats",
    );
    expect(withHttps("  www.soundcloud.com/alex ")).toBe(
      "https://www.soundcloud.com/alex",
    );
  });

  it("turns http:// into https://", () => {
    expect(withHttps("http://soundcloud.com/alex")).toBe(
      "https://soundcloud.com/alex",
    );
  });

  it("leaves other schemes for the checks to refuse", () => {
    expect(withHttps("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(
      linkError({ label: "", url: withHttps("javascript:alert(1)") }),
    ).not.toBeNull();
  });

  it("still checks the host and the path", () => {
    expect(
      linkError({ label: "", url: withHttps("instagram.com/alexbeats") }),
    ).toBeNull();
    expect(
      linkError({ label: "", url: withHttps("example.com/alexbeats") }),
    ).not.toBeNull();
  });
});
