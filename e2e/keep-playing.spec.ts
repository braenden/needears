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

// Opening another track's page stops what the feed was playing, and that
// page plays its own track.
test("another track's page does not play the feed's track", async ({
  page,
}) => {
  await page.goto("/feed?tab=latest");
  const playingCard = page
    .getByRole("listitem")
    .filter({ hasText: "Night bus" });
  await expect(async () => {
    await playingCard.getByRole("button", { name: /^Play Night bus/ }).click();
    await expect(
      playingCard.getByRole("button", { name: /^Pause Night bus/ }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass();
  await page.waitForTimeout(1500);

  await page
    .getByRole("listitem")
    .filter({ hasText: "Fast lane" })
    .getByRole("link", { name: "Fast lane" })
    .click();
  await expect(page).toHaveURL(/\/t\/fast-lane-/);
  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toBeVisible();
  // Nothing runs on: the time stays at the start.
  const time = page.locator("p[data-numeric] time").first();
  await page.waitForTimeout(1500);
  await expect(time).toHaveText("0:00");

  await play.click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});
