import type * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";

// Error monitoring with Sentry (plan part 10). It is off unless SENTRY_DSN
// is set at build time; next.config.ts passes the same value to the browser
// as NEXT_PUBLIC_SENTRY_DSN. Without a DSN the SDK is never loaded.
//
// Privacy (see the privacy page): errors only, no tracing, no replays,
// no cookies, no IP addresses and no user identity. The SDK sets no cookies.
// SDK v11 collects user info (and lets Sentry infer the IP), cookies,
// headers, bodies and query strings unless `dataCollection` says otherwise,
// so every category is turned off, and `scrubEvent` removes anything that
// slips through. Also turn on "Prevent Storing of IP Addresses" in
// the Sentry project.

export function sentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}

// The ingest origin, for the CSP's connect-src. Null when off or malformed.
export function sentryOrigin(dsn = sentryDsn()): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
]);

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  // Console messages can carry anything a page logged.
  if (event.breadcrumbs)
    event.breadcrumbs = event.breadcrumbs.filter(
      (b) => b.category !== "console",
    );
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.has(name.toLowerCase()))
          delete event.request.headers[name];
      }
    }
    // Query strings can carry auth codes (/auth/callback?code=).
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
    delete event.request.query_string;
  }
  return event;
}

export function sentryOptions(
  dsn: string,
): Sentry.BrowserOptions & Sentry.NodeOptions {
  return {
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
