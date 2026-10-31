import { describe, expect, it } from "vitest";
import { renderDigest, type DigestItem } from "./digest";

const item = (over: Partial<DigestItem> = {}): DigestItem => ({
  kind: "comment",
  actor: "Mia",
  track_title: "Night bus",
  track_slug: "night-bus-seed0002",
  time_ms: 65000,
  excerpt: "Kick is weak",
  ...over,
});

describe("renderDigest", () => {
  it("uses the single event as the subject", () => {
    const { subject, text } = renderDigest([item()], "https://needears.com");
    expect(subject).toBe("Mia commented on Night bus at 1:05");
    expect(text).toContain("https://needears.com/t/night-bus-seed0002?t=65");
    expect(text).toContain("https://needears.com/settings");
  });

  it("counts several events", () => {
    const { subject } = renderDigest(
      [item(), item({ kind: "helpful", time_ms: null })],
      "https://needears.com",
    );
    expect(subject).toBe("2 new things on your tracks and comments");
  });

  it("escapes names, titles and comment text in the HTML", () => {
    const { html } = renderDigest(
      [
        item({
          actor: "<img src=x onerror=alert(1)>",
          excerpt: '"><script>alert(1)</script>',
        }),
      ],
      "https://needears.com",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});
