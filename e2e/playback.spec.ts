import { expect, type Page, test } from "@playwright/test";
import { pageIn } from "./helpers";

// Play, pause and seek fade the sound in and out over a few milliseconds.
// The buttons must still change at once, and nothing may get stuck.
test.use({ viewport: { width: 1280, height: 900 } });

const time = (page: Page) => page.locator("p[data-numeric] time").first();
const seconds = async (page: Page) => {
  const [m, s] = (await time(page).textContent())!.split(":").map(Number);
  return m! * 60 + s!;
};

test("play, pause, a quick pause and play, and a seek", async ({ page }) => {
  await page.goto("/t/night-bus-seed0002");
  await pageIn(page);
  const play = page.getByRole("button", { name: "Play", exact: true });
  const pause = page.getByRole("button", { name: "Pause", exact: true });

  await expect(async () => {
    await play.click();
    await expect(pause).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect.poll(() => seconds(page)).toBeGreaterThanOrEqual(1);

  // Pause: the button changes at once, and the time stops.
  await pause.click();
  await expect(play).toBeVisible({ timeout: 100 });
  await page.waitForTimeout(300);
  const stopped = await seconds(page);
  await page.waitForTimeout(1200);
  expect(await seconds(page)).toBe(stopped);

  // Pause and play again in quick succession: it ends up playing.
  await play.click();
  await pause.click();
  await play.click();
  await expect(pause).toBeVisible();
  await expect.poll(() => seconds(page)).toBeGreaterThan(stopped);

  // A seek while playing lands where asked and plays on.
  await page.locator('input[type="range"][aria-label^="Seek in"]').focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await expect.poll(() => seconds(page)).toBeLessThanOrEqual(1);
  await expect(pause).toBeVisible();
  await expect.poll(() => seconds(page)).toBeGreaterThanOrEqual(2);
});
