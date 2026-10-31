import { describe, expect, it } from "vitest";
import { renderDigest, type DigestItem } from "./digest";

const item = (over: Partial<DigestItem> = {}): DigestItem => ({
  kind: "comment",
  actor: "Mia",
  track_title: "Night bus",
  track_slug: "night-bus-seed0002",
  time_ms: 65000,
  ...over,
});

describe("renderDigest", () => {
  it("uses a fixed subject and links to the moment in the track", () => {
    const { subject, text } = renderDigest([item()], 1, "https://needears.com");
    expect(subject).toBe("New feedback on Need Ears");
    expect(text).toContain("Mia commented on Night bus at 1:05");
    expect(text).toContain("https://needears.com/t/night-bus-seed0002?t=65");
    expect(text).toContain("https://needears.com/settings");
  });

  it("counts what it does not list", () => {
    const { subject, text } = renderDigest(
      [item(), item({ kind: "helpful", time_ms: null })],
      25,
      "https://needears.com",
    );
    expect(subject).toBe("25 new things on Need Ears");
    expect(text).toContain("and 23 more");
  });

  it("escapes names and titles and strips control and direction characters", () => {
    const { html, text } = renderDigest(
      [
        item({
          actor: "<img src=x onerror=alert(1)>\r\nBcc: x",
          track_title: "abc‮evil",
        }),
      ],
      1,
      "https://needears.com",
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(text).not.toMatch(/[\r‮]/);
  });
});
