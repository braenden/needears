import { expect, test } from "@playwright/test";
import { signInWithMagicLink } from "./helpers";

// The longest display name allowed and a link with no spaces, in a comment
// and in a reply, must not make a phone-wide page scroll sideways.
const handle = `e2e_l_${Date.now().toString(36)}`;
const longName = "Kristoffer Andreas Johannessen-Lindqvist Haraldsen";
const longLink = `https://example.com/${handle}/${"a".repeat(120)}`;
const trackPath = "/t/slow-tide-seed0003";

test.use({ viewport: { width: 375, height: 812 } });

test("long names and links stay inside the page on a phone", async ({
  page,
}) => {
  expect(longName).toHaveLength(50);
  await signInWithMagicLink(page, `${handle}@example.com`, trackPath);
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByLabel("Username").fill(handle);
  await page.getByLabel(/Display name/).fill(longName);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(new RegExp(`${trackPath}$`));

  const comment = `Listen to this ${longLink}`;
  await page.getByLabel("Comment", { exact: true }).fill(comment);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(
    page.getByRole("paragraph").filter({ hasText: comment }),
  ).toBeVisible();

  const thread = page.getByRole("listitem").filter({ hasText: comment });
  await thread.first().getByRole("button", { name: "Reply" }).click();
  const reply = `And this ${longLink}/reply`;
  await page.getByLabel(`Reply to ${longName}`).fill(reply);
  await thread.first().getByRole("button", { name: "Reply" }).click();
  await expect(
    page.getByRole("paragraph").filter({ hasText: reply }),
  ).toBeVisible();

  // How much wider the page is than the window; the reserved scrollbar
  // gutter can make it negative.
  const overflow = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.reload();
  await expect(
    page.getByRole("paragraph").filter({ hasText: reply }),
  ).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});
