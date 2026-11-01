import { defineConfig, devices } from "@playwright/test";

// End to end tests run against a production build (`pnpm build && pnpm start`)
// and the local Supabase stack from `supabase start`. The base URL must be
// localhost, not 127.0.0.1: it is the site_url in supabase/config.toml, so the
// magic link sends the browser back to the origin that holds the auth cookie.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const GOOGLE_URL = "http://localhost:3001";
export const E2E_GOOGLE_CLIENT_ID = "e2e-test.apps.googleusercontent.com";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: process.env.E2E_VIDEO ? "on" : "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "pnpm start --port 3000",
          url: `${baseURL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        // The same build with Google sign-in set up, for e2e/google-login.
        // The client ID is read at runtime, so no second build is needed.
        {
          command: "pnpm start --port 3001",
          url: `${GOOGLE_URL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          env: {
            NEXT_PUBLIC_GOOGLE_CLIENT_ID: E2E_GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET: "e2e-secret",
          },
        },
      ],
});
