import { expect, test } from "@playwright/test";
import { magicLinkFor, pageIn, signInWithMagicLink } from "./helpers";

// A new person changes their email in Settings. The link is opened in
// another browser, where it cannot sign in, but the change goes through
// and the page there says to check Settings.
test("change email, with the link opened in another browser", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const handle = `e2e_m_${Date.now().toString(36)}`;
  const before = `${handle}@example.com`;
  const after = `${handle}_new@example.com`;
  await signInWithMagicLink(page, before, "/settings");
  await page.getByLabel("Username").fill(handle);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await pageIn(page);

  await page.getByRole("button", { name: "Change" }).click();
  const dialog = page.getByRole("dialog", { name: "Change your email" });
  const field = dialog.getByLabel("New email");
  await field.fill(before);
  await dialog.getByRole("button", { name: "Send links" }).click();
  await expect(
    dialog.getByText("That's the address you already use."),
  ).toBeVisible();
  await field.fill("jonas@example.com");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Send links" }).click();
  await expect(
    dialog.getByText("That address belongs to another account."),
  ).toBeVisible();

  const sentAfter = Date.now() - 1_000;
  await field.fill(after);
  await dialog.getByRole("button", { name: "Send links" }).click();
  await expect(
    page.getByRole("dialog", { name: "Check your inbox" }),
  ).toBeVisible();

  const elsewhere = await (await browser.newContext()).newPage();
  await elsewhere.goto(await magicLinkFor(after, sentAfter));
  await expect(elsewhere).toHaveURL(/\/login\?error=link&next=%2Fsettings/);
  await expect(
    elsewhere.getByText(/your email change may have gone through/),
  ).toBeVisible();

  await page.reload();
  await pageIn(page);
  await expect(page.getByText(after)).toBeVisible();
});
