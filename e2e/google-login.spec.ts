import { expect, test } from "@playwright/test";
import { E2E_GOOGLE_CLIENT_ID, GOOGLE_URL } from "../playwright.config";

// Sign in with Google Identity Services. Google's popup cannot run in CI, so
// Google's script is replaced by a stand-in that records what the page asks
// for; the token and nonce handling is covered by unit tests.
const GSI = "https://accounts.google.com/gsi/client";

const fakeGsi = `
  window.__gsi = [];
  window.google = { accounts: { id: {
    initialize: (config) => window.__gsi.push(config),
    renderButton: (parent) => {
      const button = document.createElement("button");
      button.textContent = "Sign in with Google";
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
