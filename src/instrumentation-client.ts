import { sentryDsn, sentryOptions } from "@/lib/monitoring/sentry";

// Browser error monitoring. The DSN is inlined at build time, so without one
// this file does nothing and the SDK is not downloaded.
const dsn = sentryDsn();
if (dsn) {
  void import("@sentry/nextjs")
    .then((Sentry) => Sentry.init(sentryOptions(dsn)))
    .catch(() => {});
}
