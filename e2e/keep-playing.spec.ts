import { expect, test } from "@playwright/test";

// A track playing in the feed keeps playing when its page is opened, from
// the same second, like SoundCloud.
test("playback carries on from the feed into the track page", async ({
  page,
}) => {
  await page.goto("/feed?tab=latest");
  const card = page.getByRole("listitem").filter({ hasText: "Night bus" });
  // Waits for the page to hydrate before the click does anything.
  await expect(async () => {
    await card.getByRole("button", { name: /^Play Night bus/ }).click();
    await expect(
      card.getByRole("button", { name: /^Pause Night bus/ }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass();
  // Let it play a moment.
  await page.waitForTimeout(2500);

  await card.getByRole("link", { name: "Night bus" }).click();
  await expect(page).toHaveURL(/\/t\/night-bus-seed0002$/);
  // Still playing, and not from the start.
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  const time = page.locator("p[data-numeric] time").first();
  await expect(time).not.toHaveText("0:00");
});
