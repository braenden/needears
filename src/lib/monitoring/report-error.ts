import { sentryDsn } from "./sentry";

// For error boundaries, which catch errors before Sentry's global handlers
// see them. Does nothing without a DSN.
export function reportError(error: unknown) {
  if (!sentryDsn()) return;
  void import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {});
}
