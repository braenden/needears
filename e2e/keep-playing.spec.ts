import { expect, test } from "@playwright/test";
import { pageIn } from "./helpers";

// A track playing in the feed keeps playing when its page is opened, from
// the same second, like SoundCloud.
test("playback carries on from the feed into the track page", async ({
  page,
}) => {
  // Night bus is House: on the first page of this filter, however many
  // tracks earlier runs have uploaded.
  await page.goto("/feed?tab=latest&genre=house");
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

// Opening another track's page stops what a track list was playing, and
// that page plays its own track. Nora's profile lists both tracks.
test("another track's page does not play the list's track", async ({
  page,
}) => {
  await page.goto("/u/nora");
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
    .filter({ hasText: "Slow tide" })
    .getByRole("link", { name: "Slow tide" })
    .click();
  await expect(page).toHaveURL(/\/t\/slow-tide-/);
  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toBeVisible();
  // Nothing runs on: the time stays at the start.
  const time = page.locator("p[data-numeric] time").first();
  await page.waitForTimeout(1500);
  await expect(time).toHaveText("0:00");

  await play.click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});

// Leaving a track that is playing stops it. Going back to the page finds it
// where it was, paused: it never starts playing on its own.
test("going back to a track that was playing does not start it again", async ({
  page,
}) => {
  await page.goto("/t/night-bus-seed0002");
  await pageIn(page);
  const play = page.getByRole("button", { name: "Play", exact: true }).first();
  const pause = page
    .getByRole("button", { name: "Pause", exact: true })
    .first();
  const time = page.locator("p[data-numeric] time").first();

  await expect(async () => {
    await play.click();
    await expect(pause).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(time).not.toHaveText("0:00");

  await page.getByRole("link", { name: "Nora", exact: true }).first().click();
  await expect(page).toHaveURL(/\/u\/nora$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/t\/night-bus-seed0002$/);
  await pageIn(page);

  await expect(play).toBeVisible();
  await expect(pause).toHaveCount(0);
  // Where it was, and staying there.
  await expect(time).not.toHaveText("0:00");
  const stopped = await time.textContent();
  await page.waitForTimeout(1500);
  await expect(time).toHaveText(stopped!);
});
