import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowedLinkUrl, profileSeedSql } from "./profile";

describe("isAllowedLinkUrl", () => {
  it.each([
    "https://soundcloud.com/nora",
    "https://nora.bandcamp.com/album/first",
    "https://www.instagram.com/nora/",
    "https://open.spotify.com/artist/abc",
    "https://www.youtube.com/@nora",
    "https://www.tiktok.com/@nora",
  ])("accepts %s", (url) => {
    expect(isAllowedLinkUrl(url)).toBe(true);
  });

  it.each([
    "http://soundcloud.com/nora",
    "https://evil.com/soundcloud.com",
    "https://soundcloud.com.evil.com/",
    "https://notsoundcloud.com/",
    "https://soundcloud.com:8443/",
    "https://user@soundcloud.com/",
    "javascript:alert(1)",
    "https://soundcloud.com/a b",
    "HTTPS://SOUNDCLOUD.COM/x",
    "https://soundcloud.com/\u202eevil",
    `https://soundcloud.com/${"a".repeat(300)}`,
  ])("rejects %s", (url) => {
    expect(isAllowedLinkUrl(url)).toBe(false);
  });

  it("matches supabase/seeds/profile.sql (run `pnpm db:config` if this fails)", () => {
    const file = readFileSync(
      new URL("../../supabase/seeds/profile.sql", import.meta.url),
      "utf8",
    );
    expect(file).toBe(profileSeedSql());
  });
});
