import { expect, test } from "@playwright/test";
import { pageIn, signInWithMagicLink } from "./helpers";

// A new person who skips picking a username cannot post under the made-up
// one: posting sends them to pick a name, and what they wrote comes back.
test("posting without a username asks for one and keeps the text", async ({
  page,
}) => {
  const handle = `e2e_s_${Date.now().toString(36)}`;
  const text = `Kick and bass fight around 0:30 ${handle}`;
  const trackPath = "/t/neon-steps-seed0009";

  await signInWithMagicLink(page, `${handle}@example.com`, trackPath);
  await expect(page).toHaveURL(/\/welcome/);

  // Skipping it.
  await page.goto("/upload");
  await expect(page).toHaveURL(/\/welcome\?next=(%2F|\/)upload/);
  await page.goto(trackPath);
  await pageIn(page);
  await page.getByLabel("Comment", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Comment", exact: true }).click();

  await expect(page).toHaveURL(/\/welcome\?next=%2Ft%2Fneon-steps-seed0009/);
  await page.getByLabel("Username").fill(handle);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(new RegExp(`${trackPath}$`));
  await pageIn(page);
  const box = page.getByLabel("Comment", { exact: true });
  await expect(box).toHaveValue(text);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const posted = page.getByRole("listitem").filter({ hasText: text }).first();
  await expect(posted).toBeVisible();
  await expect(
    posted.getByRole("link", { name: new RegExp(handle) }),
  ).toBeVisible();
  await expect(page.getByText(/producer_/)).toHaveCount(0);
});
