import { expect, type Page, test } from "@playwright/test";
import { E2E_GOOGLE_CLIENT_ID, GOOGLE_URL } from "../playwright.config";
import { magicLinkFor } from "./helpers";

// Sign in with Google: Google's account chooser opens in a popup (its code
// client), our server swaps the code for Google's ID token, and the page
// signs in with it at Supabase. Google cannot answer in CI, so a stand-in
// for its script hands back a code, and the swap is covered by unit tests.

const fakeGsi = `
  window.google = { accounts: { oauth2: {
    initCodeClient: (config) => ({
      requestCode: () => {
        window.codeClient = {
          client_id: config.client_id,
          ux_mode: config.ux_mode,
          scope: config.scope,
          select_account: config.select_account,
        };
        config.callback({ code: "4/e2e-code", state: config.state });
      },
    }),
  } } };
`;

const lastLogin = (page: Page) =>
  page.evaluate(() => localStorage.getItem("needears:last-login"));

/** Google's script is the stand-in, and our swap answers with a token. */
async function fakeGoogle(page: Page) {
  await page.route("https://accounts.google.com/gsi/client**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeGsi }),
  );
  const swapped: unknown[] = [];
  await page.route("**/api/auth/google-token", (route) => {
    swapped.push(route.request().postDataJSON());
    return route.fulfill({ json: { idToken: "e2e-id-token" } });
  });
  return swapped;
}

test("without a client ID, only the email link is offered", async ({
  page,
}) => {
  const response = await page.goto("/login");
  // Nothing from Google is allowed in where Google is not set up.
  expect(response?.headers()["content-security-policy"]).not.toContain(
    "accounts.google.com",
  );
  await expect(
    page.getByRole("button", { name: "Continue with email" }),
  ).toBeVisible();
  await expect(page.getByTestId("google-button")).toHaveCount(0);
  await expect(page.getByText("or", { exact: true })).toHaveCount(0);
});

test("the code swap only answers our own site, and only when set up", async ({
  request,
  baseURL,
}) => {
  const url = "/api/auth/google-token";
  const data = { code: "4/e2e-code" };
  const foreign = await request.post(url, {
    data,
    headers: { Origin: "https://evil.example" },
  });
  expect(foreign.status()).toBe(403);
  // Our own site, but Google is not set up on this server.
  const off = await request.post(url, {
    data,
    headers: { Origin: new URL(baseURL!).origin },
  });
  expect(off.status()).toBe(503);
});

test("Continue with Google opens Google's popup and signs in with the token", async ({
  page,
}) => {
  const swapped = await fakeGoogle(page);
  let asked: Record<string, unknown> | null = null;
  // Supabase is asked to sign in with the ID token. Its answer is a
  // stand-in session, since the local stack has no Google.
  await page.route("**/auth/v1/token?grant_type=id_token", (route) => {
    asked = route.request().postDataJSON();
    return route.fulfill({
      json: {
        access_token: "e2e-access",
        refresh_token: "e2e-refresh",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: "00000000-0000-4000-8000-0000000000e2",
          aud: "authenticated",
          email: "e2e@example.com",
          app_metadata: { provider: "google" },
          user_metadata: { onboarded: true },
          created_at: new Date().toISOString(),
        },
      },
    });
  });
  // Where it goes next, without loading the page signed out.
  await page.route(`${GOOGLE_URL}/upload`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Upload</p>" }),
  );

  await page.goto(`${GOOGLE_URL}/login?next=%2Fupload`);
  expect(await lastLogin(page)).toBeNull();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(`${GOOGLE_URL}/upload`);

  expect(swapped).toEqual([{ code: "4/e2e-code" }]);
  expect(asked).toMatchObject({ provider: "google", id_token: "e2e-id-token" });
  // Remembered once the sign-in has worked.
  expect(await lastLogin(page)).toBe("google");
  await page.unroute(`${GOOGLE_URL}/upload`);
  // The stand-in session means nothing to the server; drop it.
  await page.context().clearCookies();
  await page.goto(`${GOOGLE_URL}/login`);
  await expect(
    page.getByText("You signed in with Google last time."),
  ).toBeVisible();
});

test("the popup is for our client, and signing in again asks which account", async ({
  page,
}) => {
  await fakeGoogle(page);
  // Supabase turns it down here, so the page stays and says so.
  await page.route("**/auth/v1/token?grant_type=id_token", (route) =>
    route.fulfill({ status: 400, json: { error: "invalid_grant" } }),
  );
  const codeClient = () =>
    page.evaluate(() => (window as { codeClient?: unknown }).codeClient);

  await page.goto(`${GOOGLE_URL}/login`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByText(
      "Google sign-in didn't work. Try again, or use the email link.",
    ),
  ).toBeVisible();
  expect(await codeClient()).toEqual({
    client_id: E2E_GOOGLE_CLIENT_ID,
    ux_mode: "popup",
    scope: "openid email profile",
    select_account: false,
  });
  // Nothing is remembered from a sign-in that did not work.
  expect(await lastLogin(page)).toBeNull();

  await page.goto(`${GOOGLE_URL}/login?reauth=1`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect.poll(codeClient).toMatchObject({ select_account: true });
});

test("Google's own script opens its window for our client and our site", async ({
  page,
  context,
}) => {
  // Google's real script, and its window answered here, so nothing is
  // signed in and only what the window is asked for is checked.
  let opened: URL | null = null;
  await context.route("https://accounts.google.com/o/oauth2/**", (route) => {
    opened = new URL(route.request().url());
    return route.fulfill({ contentType: "text/html", body: "<p>Google</p>" });
  });
  await page.goto(`${GOOGLE_URL}/login?reauth=1`);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as { google?: { accounts?: { oauth2?: unknown } } }).google
            ?.accounts?.oauth2,
        ),
      ),
    )
    .toBe(true);
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Continue with Google" }).click(),
  ]);
  await popup.waitForLoadState();
  await expect.poll(() => opened).not.toBeNull();
  const url = opened as unknown as URL;
  expect(url.searchParams.get("client_id")).toBe(E2E_GOOGLE_CLIENT_ID);
  // Handed back to this page in the popup, never sent on to an address
  // (Google's script names it postmessage or gis_transform). The code is
  // then swapped with redirect_uri postmessage, as Google expects.
  expect(["postmessage", "gis_transform"]).toContain(
    url.searchParams.get("redirect_uri"),
  );
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("prompt")?.split(" ")).toContain(
    "select_account",
  );
  expect(url.searchParams.get("state")).toBeTruthy();
  // Our own site is named, not Supabase's.
  expect(url.searchParams.get("origin")).toBe(GOOGLE_URL);
});

test("after a magic link, the login page marks email as last used", async ({
  page,
}) => {
  // Signs in on the server with Google set up, so the hint can show there
  // (the browser keeps it per origin).
  const sentAfter = Date.now() - 1_000;
  await page.goto(`${GOOGLE_URL}/login?next=%2Ffeed`);
  await expect(page.getByText(/last time/)).toHaveCount(0);
  await page.getByLabel("Email", { exact: true }).fill("jonas@example.com");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.getByText("Check your email.")).toBeVisible();
  await page.goto(await magicLinkFor("jonas@example.com", sentAfter));
  await expect(page).toHaveURL(`${GOOGLE_URL}/feed`);

  // Signed in already, so ask to sign in again to see the form.
  await page.goto(`${GOOGLE_URL}/login?reauth=1`);
  await expect(
    page.getByText("You signed in with email last time."),
  ).toBeVisible();
});

test("Google's popup keeps its opener, so it can hand back the code", async ({
  page,
  context,
}) => {
  await context.route("https://accounts.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>popup</p>" }),
  );
  await page.goto(`${GOOGLE_URL}/login`);
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.evaluate(() => {
      window.open("https://accounts.google.com/gsi/select", "g", "popup");
    }),
  ]);
  await popup.waitForLoadState();
  expect(await popup.evaluate(() => window.opener !== null)).toBe(true);
});
