import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "./csp";

const base = {
  nonce: "abc123",
  supabaseOrigin: "https://xyz.supabase.co",
  isDev: false,
  upgradeInsecure: true,
};

function directive(csp: string, name: string) {
  return csp
    .split("; ")
    .find((part) => part.startsWith(`${name} `))
    ?.slice(name.length + 1);
}

describe("buildCsp", () => {
  it("only runs scripts with the nonce in production", () => {
    const csp = buildCsp(base);
    expect(directive(csp, "script-src")).toBe(
      "'self' 'nonce-abc123' 'strict-dynamic'",
    );
    expect(csp).not.toContain("unsafe-eval");
  });

  it("forbids framing, plugins and foreign forms", () => {
    const csp = buildCsp(base);
    expect(directive(csp, "frame-ancestors")).toBe("'none'");
    expect(directive(csp, "object-src")).toBe("'none'");
    expect(directive(csp, "form-action")).toBe("'self'");
    expect(directive(csp, "base-uri")).toBe("'self'");
  });

  it("allows audio and fetches from Supabase only", () => {
    const csp = buildCsp(base);
    expect(directive(csp, "media-src")).toBe(
      "'self' blob: https://xyz.supabase.co",
    );
    expect(directive(csp, "connect-src")).toBe(
      "'self' https://xyz.supabase.co",
    );
  });

  it("allows the Sentry ingest origin for fetches when Sentry is on", () => {
    const csp = buildCsp({
      ...base,
      sentryOrigin: "https://o1.ingest.de.sentry.io",
    });
    expect(directive(csp, "connect-src")).toBe(
      "'self' https://xyz.supabase.co https://o1.ingest.de.sentry.io",
    );
  });

  it("lets Google Identity Services in only when Google sign-in is on", () => {
    const off = buildCsp(base);
    expect(off).not.toContain("accounts.google.com");
    expect(directive(off, "frame-src")).toBeUndefined();

    const on = buildCsp({ ...base, googleSignIn: true });
    expect(directive(on, "script-src")).toBe(
      "'self' 'nonce-abc123' 'strict-dynamic' https://accounts.google.com/gsi/client",
    );
    expect(directive(on, "style-src")).toBe(
      "'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    );
    expect(directive(on, "frame-src")).toBe(
      "'self' https://accounts.google.com/gsi/",
    );
    expect(directive(on, "connect-src")).toBe(
      "'self' https://xyz.supabase.co https://accounts.google.com/gsi/",
    );
  });

  it("allows eval and hot reload in development", () => {
    const csp = buildCsp({ ...base, isDev: true, upgradeInsecure: false });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).toContain("ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("createNonce", () => {
  it("is different every time", () => {
    expect(createNonce()).not.toBe(createNonce());
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
