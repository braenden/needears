import { expect, test } from "@playwright/test";
import { pageIn, signInWithMagicLink } from "./helpers";

// The avatar shows its name ("Account") on hover. A closing menu used to
// hand the focus back to the avatar every time, so after a click its name
// and a focus ring hung there, over the page that was just opened. Now the
// focus only goes back when the menu was closed with the keyboard.
test("nothing hangs by the avatar after the menu closes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInWithMagicLink(page, "nora@example.com", "/feed");
  await pageIn(page);
  const avatar = page.getByRole("button", { name: "Account menu" });
  const name = page.getByRole("tooltip");

  // Hovering still names it.
  await avatar.hover();
  await expect(name).toHaveText("Account");

  // Picking a row: the profile opens and nothing hangs by the avatar.
  await avatar.click();
  await expect(name).toHaveCount(0);
  await page.locator('[role="menuitem"][href="/u/nora"]').click();
  await expect(page).toHaveURL(/\/u\/nora$/);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.mouse.move(400, 400);
  await expect(name).toHaveCount(0);
  await expect(avatar).not.toBeFocused();

  // Clicking beside the menu closes it the same way.
  await avatar.click();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await page.mouse.click(400, 400);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(avatar).not.toBeFocused();
  await expect(name).toHaveCount(0);

  // Closing it with the keyboard: the focus is back, still no name.
  await avatar.click();
  await page.mouse.move(400, 400);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(avatar).toBeFocused();
  await expect(name).toHaveCount(0);
});
