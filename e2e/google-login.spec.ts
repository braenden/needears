import { expect, test } from "@playwright/test";
import { E2E_GOOGLE_CLIENT_ID, GOOGLE_URL } from "../playwright.config";
import { magicLinkFor } from "./helpers";

// Sign in with Google Identity Services. Google's popup cannot run in CI, so
// Google's script is replaced by a stand-in that records what the page asks
// for; the token and nonce handling is covered by unit tests.
const GSI = "https://accounts.google.com/gsi/client";

const fakeGsi = `
  window.__gsi = [];
  window.__widths = [];
  window.google = { accounts: { id: {
    initialize: (config) => window.__gsi.push(config),
    renderButton: (parent, options) => {
      window.__widths.push(options.width);
      const button = document.createElement("button");
      button.textContent = "Sign in with Google";
      button.style.width = options.width + "px";
      parent.appendChild(button);
    },
  } } };
`;

test("without a client ID, only the email link is offered", async ({
  page,
}) => {
  const response = await page.goto("/login");
  expect(response?.headers()["content-security-policy"]).not.toContain(
    "accounts.google.com",
  );
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" }),
  ).toBeVisible();
  await expect(page.getByTestId("google-button")).toHaveCount(0);
  await expect(page.getByText("or", { exact: true })).toHaveCount(0);
});

test("with a client ID, Google's button is offered with a hashed nonce", async ({
  page,
}) => {
  let requested = false;
  await page.route(`${GSI}**`, (route) => {
    requested = true;
    return route.fulfill({ contentType: "text/javascript", body: fakeGsi });
  });
  const response = await page.goto(`${GOOGLE_URL}/login?next=%2Fupload`);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-src 'self' https://accounts.google.com/gsi/");

  await expect(
    page.getByTestId("google-button").getByRole("button", {
      name: "Sign in with Google",
    }),
  ).toBeVisible();
  expect(requested).toBe(true);

  // The script tag carries the page's CSP nonce.
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(
    await page
      .locator(`script[src="${GSI}"]`)
      .evaluate((el: HTMLScriptElement) => el.nonce),
  ).toBe(nonce);

  const config = await page.evaluate(
    () =>
      (window as unknown as { __gsi: { client_id: string; nonce: string }[] })
        .__gsi[0],
  );
  expect(config?.client_id).toBe(E2E_GOOGLE_CLIENT_ID);
  expect(config?.nonce).toMatch(/^[0-9a-f]{64}$/);

  // The email link is still there.
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" }),
  ).toBeVisible();
});

test("after a magic link, the login page marks email as last used", async ({
  page,
}) => {
  await page.route(`${GSI}**`, (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeGsi }),
  );
  // Signs in on the server with Google set up, so the badge can show there
  // (the browser keeps it per origin).
  const sentAfter = Date.now() - 1_000;
  await page.goto(`${GOOGLE_URL}/login?next=%2Ffeed`);
  await expect(page.getByText("Last used")).toHaveCount(0);
  await page.getByLabel("Email", { exact: true }).fill("jonas@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email.")).toBeVisible();
  await page.goto(await magicLinkFor("jonas@example.com", sentAfter));
  await expect(page).toHaveURL(`${GOOGLE_URL}/feed`);

  // Signed in already, so ask to sign in again to see the form.
  await page.goto(`${GOOGLE_URL}/login?reauth=1`);
  const form = page
    .locator("form")
    .filter({ hasText: "Email me a sign-in link" });
  await expect(form.getByText("Last used")).toBeVisible();
  await expect(page.getByText("Last used")).toHaveCount(1);
});

test("Google gets the full width after a client-side navigation", async ({
  page,
}) => {
  await page.route(`${GSI}**`, (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeGsi }),
  );
  await page.goto(`${GOOGLE_URL}/feed`);
  // Wait for the page to hydrate, then go to /login without a full load.
  await expect(async () => {
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${GOOGLE_URL}/login`, { timeout: 2000 });
  }).toPass();
  const button = page
    .getByTestId("google-button")
    .getByRole("button", { name: "Sign in with Google" });
  await expect(button).toBeVisible();
  const container = await page.getByTestId("google-button").boundingBox();
  const widths = await page.evaluate(
    () => (window as unknown as { __widths: number[] }).__widths,
  );
  // As wide as the column, not Google's 200 pixel minimum.
  expect(widths.at(-1)).toBe(Math.round(container!.width));
});

test("Google's popup keeps its opener, so it can hand back the token", async ({
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
