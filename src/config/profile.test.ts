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
    "https://x.com/needearscom",
    "https://twitter.com/needearscom",
    "https://music.apple.com/no/artist/nora/1",
    "https://www.facebook.com/nora",
    "https://youtu.be/abc",
    "https://www.mixcloud.com/nora/",
    "https://www.threads.com/@nora",
    "https://nora.bandcamp.com/album/one",
    "https://listen.tidal.com/artist/1",
    "https://soundcloud.com/nora/bl%C3%A5-time",
    "https://www.youtube.com/watch?v=abc&t=1%3A20",
    "https://open.spotify.com/track/abc?si=../oauth2#/redirect",
    "https://soundcloud.com/nora/oauth-demo",
  ])("accepts %s", (url) => {
    expect(isAllowedLinkUrl(url)).toBe(true);
  });

  it.each([
    "http://soundcloud.com/nora",
    "https://evil.com/soundcloud.com",
    "https://soundcloud.com.evil.com/",
    "https://notsoundcloud.com/",
    "https://apple.com/nora",
    "https://linktr.ee/nora",
    "https://l.facebook.com/l.php?u=https://evil.example",
    "https://lm.facebook.com/x",
    "https://l.threads.net/?u=https://evil.example",
    "https://apps.facebook.com/x",
    "https://id.twitch.tv/oauth2/authorize",
    "https://www.youtube.com/redirect?q=https://evil.example",
    "https://x.com/i/redirect?url=https://evil.example",
    "https://www.facebook.com/dialog/oauth",
    "https://www.twitch.tv/foo/../oauth2/authorize",
    "https://www.twitch.tv/./oauth2/authorize",
    "https://www.twitch.tv/foo/%2e%2e/oauth2/authorize",
    "https://www.facebook.com/x/../dialog/oauth",
    "https://www.youtube.com/a/../redirect?q=https://evil.example",
    "https://x.com/i/../i/redirect?url=https://evil.example",
    "https://www.twitch.tv/foo\\..\\oauth2",
    "https://www.twitch.tv//oauth2/authorize",
    "https://www.twitch.tv/\\oauth2",
    "https://www.twitch.tv/%6fauth2/authorize",
    "https://www.facebook.com/l%2ephp?u=https://evil.example",
    "https://x.com/i/oauth2/authorize?client_id=1",
    "https://www.facebook.com/v19.0/dialog/oauth?client_id=1",
    "https://www.facebook.com/DIALOG/OAuth",
    "https://.x.com/",
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
