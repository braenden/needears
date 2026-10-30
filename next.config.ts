import createMDX from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

// Headers that are the same on every response. The CSP needs a nonce per
// request, so it is set in src/proxy.ts instead.
const securityHeaders = [
  // Two years, subdomains too. Browsers ignore it over plain http (local).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Pages opened from here (or that open us) get no handle to this window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // frame-ancestors in the CSP does the same for modern browsers.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // One variable turns Sentry on for the server and the browser
  // (src/lib/monitoring/sentry.ts). Empty means off.
  env: { NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "" },
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Metadata in <head> for every client, not streamed in later. Pages are
  // rendered per request anyway, and the metadata reads the same cached
  // data as the page.
  htmlLimitedBots: /.*/,
  experimental: {
    // Every page is rendered per request because of the CSP nonce (see
    // src/app/layout.tsx), so the instant navigation checks only run on
    // segments that ask for them.
    instantInsights: { validationLevel: "manual-warning" },
  },
  pageExtensions: ["ts", "tsx", "mdx"],
  // We keep our own AGENTS.md instead of the block `next dev` writes.
  agentRules: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withMDX = createMDX({
  options: {
    // Tables in the privacy policy.
    remarkPlugins: ["remark-gfm"],
  },
});

// The Sentry build plugin only uploads source maps, so it is only added when
// there is a token to upload with. Errors are reported without it.
const config = withMDX(nextConfig);
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      telemetry: false,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : config;
