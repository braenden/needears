import { expect, test } from "@playwright/test";

// The security headers from src/proxy.ts and next.config.ts (issue 003).
test("pages send a nonce based CSP and the hardening headers", async ({
  request,
}) => {
  const first = await request.get("/feed");
  const second = await request.get("/feed");
  expect(first.status()).toBe(200);

  const headers = first.headers();
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  // A fresh nonce per response.
  const nonce = (value: string) => value.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce(second.headers()["content-security-policy"] ?? "")).not.toBe(
    nonce(csp),
  );

  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  // Google's sign-in popup needs its opener to hand back the token.
  expect(headers["cross-origin-opener-policy"]).toBe(
    "same-origin-allow-popups",
  );
  expect(headers["referrer-policy"]).toBeTruthy();
  expect(headers["permissions-policy"]).toBeTruthy();
});
