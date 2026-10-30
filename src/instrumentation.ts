import type { Instrumentation } from "next";
import { sentryDsn, sentryOptions } from "@/lib/monitoring/sentry";

// Server side error monitoring. Only loads Sentry when a DSN is configured.
export async function register() {
  const dsn = sentryDsn();
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(sentryOptions(dsn));
}

// Errors in server components, route handlers, server actions and the proxy.
export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (!sentryDsn()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
