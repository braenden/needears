import { describe, expect, it } from "vitest";
import { isFreshSession, sessionAuthenticatedAt } from "./reauth";

const now = Date.parse("2026-10-30T12:00:00Z");
const seconds = (ms: number) => Math.floor(ms / 1000);
const window = 10 * 60 * 1000;

describe("sessionAuthenticatedAt", () => {
  it("takes the latest method timestamp", () => {
    expect(
      sessionAuthenticatedAt([
        { method: "oauth", timestamp: 100 },
        { method: "otp", timestamp: 200 },
      ]),
    ).toBe(200_000);
  });

  it.each([undefined, null, "oauth", ["oauth"], [{ method: "otp" }], {}])(
    "has no time for %j",
    (amr) => {
      expect(sessionAuthenticatedAt(amr)).toBeNull();
    },
  );
});

describe("isFreshSession", () => {
  it("accepts a session that signed in five minutes ago", () => {
    const amr = [{ method: "otp", timestamp: seconds(now - 5 * 60 * 1000) }];
    expect(isFreshSession(amr, window, now)).toBe(true);
  });

  it("refuses an old session, however recently the account signed in elsewhere", () => {
    // The account's last_sign_in_at may be a minute ago (another device),
    // but this session proved itself two hours ago.
    const amr = [
      { method: "oauth", timestamp: seconds(now - 2 * 3600 * 1000) },
    ];
    expect(isFreshSession(amr, window, now)).toBe(false);
  });

  it("refuses a session without timestamps", () => {
    expect(isFreshSession(["password"], window, now)).toBe(false);
    expect(isFreshSession(undefined, window, now)).toBe(false);
  });

  it("refuses timestamps from the future", () => {
    const amr = [{ method: "otp", timestamp: seconds(now + 3600 * 1000) }];
    expect(isFreshSession(amr, window, now)).toBe(false);
  });
});
