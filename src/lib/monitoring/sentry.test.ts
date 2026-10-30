import type { ErrorEvent } from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrubEvent, sentryDsn, sentryOrigin } from "./sentry";

describe("sentryDsn", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off without a DSN", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    expect(sentryDsn()).toBeUndefined();
    expect(sentryOrigin()).toBeNull();
  });

  it("gives the ingest origin for the CSP", () => {
    expect(sentryOrigin("https://key@o1.ingest.de.sentry.io/42")).toBe(
      "https://o1.ingest.de.sentry.io",
    );
    expect(sentryOrigin("not a url")).toBeNull();
  });
});

describe("scrubEvent", () => {
  it("drops the user, cookies, IP headers, bodies and query strings", () => {
    const event = scrubEvent({
      type: undefined,
      breadcrumbs: [
        { category: "console", message: "nora@example.com" },
        { category: "navigation", data: { to: "/feed" } },
      ],
      user: { id: "u1", ip_address: "203.0.113.7" },
      request: {
        url: "https://needears.com/auth/callback?code=secret",
        query_string: "code=secret",
        cookies: { "sb-access-token": "jwt" },
        data: { email: "nora@example.com" },
        headers: {
          Cookie: "sb=jwt",
          Authorization: "Bearer jwt",
          "X-Forwarded-For": "203.0.113.7",
          "User-Agent": "Firefox",
        },
      },
    } as ErrorEvent);

    expect(event.user).toBeUndefined();
    expect(event.breadcrumbs).toEqual([
      { category: "navigation", data: { to: "/feed" } },
    ]);
    expect(event.request).toEqual({
      url: "https://needears.com/auth/callback",
      headers: { "User-Agent": "Firefox" },
    });
  });
});
