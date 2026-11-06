import { expect, test } from "@playwright/test";
import { magicLinkFor } from "./helpers";

// The sign-in link opens in a new tab. The tab that sent it moves on as
// well, instead of staying on "Check your email". A new person picks a
// username from an empty field, and the header shows no made-up initials
// until then.
test("the waiting tab follows a sign-in in another tab", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const waiting = await context.newPage();
  const handle = `e2e_t_${Date.now().toString(36)}`;
  const email = `${handle}@example.com`;
  const sentAfter = Date.now() - 1_000;
  await waiting.goto("/login?next=/upload");
  await waiting.getByLabel("Email", { exact: true }).fill(email);
  await waiting
    .getByRole("button", { name: "Email me a sign-in link" })
    .click();
  await expect(waiting.getByText("Check your email.")).toBeVisible();

  const link = await context.newPage();
  await link.goto(await magicLinkFor(email, sentAfter));
  await expect(link).toHaveURL(/\/welcome/);
  await expect(waiting).toHaveURL(/\/welcome\?next=%2Fupload/);

  const username = link.getByLabel("Username");
  await expect(username).toHaveValue("");
  await expect(link.getByRole("button", { name: "Account menu" })).toHaveText(
    "Account menu",
  );

  // Errors say what is wrong, and go once it is fine.
  await link.getByRole("button", { name: "Continue" }).click();
  await expect(link.getByText("Pick a username.")).toBeVisible();
  await username.fill("a");
  await expect(
    link.getByText("Use 3 to 20 letters, numbers or underscores."),
  ).toBeVisible();
  await username.fill(handle);
  await expect(
    link.getByText(/Use 3 to 20 letters|Pick a username\./),
  ).toHaveCount(0);
  await expect(username).not.toHaveAttribute("aria-invalid");

  await link.getByRole("button", { name: "Continue" }).click();
  await expect(link).toHaveURL(/\/upload$/);
  await expect(
    link.getByRole("button", { name: "Account menu" }),
  ).not.toHaveText("Account menu");
});
