import { expect, test } from "@playwright/test";
import { GOOGLE_URL } from "../playwright.config";
import { magicLinkFor, signInWithMagicLink } from "./helpers";

// Connected accounts in Settings, for someone who signs in with the email
// link. Google's popup cannot run in CI, so its script is replaced by a
// stand-in, and linking the token is covered by unit tests.
const fakeGsi = `
  window.google = { accounts: { id: {
    initialize: () => {},
    renderButton: (parent) => {
      const button = document.createElement("button");
      button.textContent = "Sign in with Google";
      parent.appendChild(button);
    },
  } } };
`;

test("without Google set up, the card only lists the email link", async ({
  page,
}) => {
  await signInWithMagicLink(page, "jonas@example.com", "/settings");
  const card = page.getByRole("region", { name: "Connected accounts" });
  await expect(card.getByText("jonas@example.com")).toBeVisible();
  await expect(card.getByText("Not connected")).toBeVisible();
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByRole("link")).toHaveCount(0);

  // The data export names the address of each way to sign in.
  const exported = await page.request.get("/api/account/export");
  const data = (await exported.json()) as {
    account: { identities: { provider: string; email: string | null }[] };
  };
  expect(data.account.identities).toContainEqual(
    expect.objectContaining({ provider: "email", email: "jonas@example.com" }),
  );
});

test("right after signing in, Google's button connects", async ({ page }) => {
  await page.route("https://accounts.google.com/gsi/client**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeGsi }),
  );
  const sentAfter = Date.now() - 1_000;
  await page.goto(`${GOOGLE_URL}/login?next=%2Fsettings`);
  await page.getByLabel("Email", { exact: true }).fill("mia@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email.")).toBeVisible();
  await page.goto(await magicLinkFor("mia@example.com", sentAfter));
  await expect(page).toHaveURL(`${GOOGLE_URL}/settings`);

  const card = page.getByRole("region", { name: "Connected accounts" });
  await expect(card.getByText("mia@example.com")).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Sign in with Google" }),
  ).toBeVisible();
});

test("signing in again to connect Google offers only the email link", async ({
  page,
}) => {
  await page.route("https://accounts.google.com/gsi/client**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeGsi }),
  );
  await page.goto(`${GOOGLE_URL}/login?reauth=connect&next=%2Fsettings`);
  await expect(page.getByText(/Sign in again to connect Google/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" }),
  ).toBeVisible();
  await expect(page.getByTestId("google-button")).toHaveCount(0);
  // The usual sign-in page on the same server does offer Google.
  await page.goto(`${GOOGLE_URL}/login`);
  await expect(page.getByTestId("google-button")).toHaveCount(1);
});
