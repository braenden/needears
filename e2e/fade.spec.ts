import { expect, test } from "@playwright/test";
import { largestStep, pageIn, watchVolumeSteps } from "./helpers";

// Play, pause and seek fade the volume, so the sound does not click. A
// hook on the element's volume records the largest single change while
// sound plays: a fade moves in small steps (0.3 at most), a cut jumps from
// 1 to 0. On a 4 times slower CPU, so a busy page cannot hide a cut.
const MAX_STEP = 0.35;

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  await watchVolumeSteps(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
});

test("the track page fades on play, pause and seek", async ({ page }) => {
  await page.goto("/t/night-bus-seed0002");
  await pageIn(page);
  const play = page.getByRole("button", { name: "Play", exact: true });
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  await expect(play).toBeEnabled();
  await page.waitForTimeout(1000);

  expect(await largestStep(page, () => play.click())).toBeLessThan(MAX_STEP);
  await expect(pause).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await largestStep(page, () => pause.click())).toBeLessThan(MAX_STEP);

  await play.click();
  await expect(pause).toBeVisible();
  await page.waitForTimeout(1000);
  const seek = page.locator('input[type="range"][aria-label^="Seek in"]');
  expect(
    await largestStep(page, async () => {
      await seek.focus();
      await page.keyboard.press("ArrowRight");
    }),
  ).toBeLessThan(MAX_STEP);
});

test("a track card fades on play and pause", async ({ page }) => {
  // Nora's profile always lists Night bus, however many tracks the feed has.
  await page.goto("/u/nora");
  await pageIn(page);
  const card = page.getByRole("listitem").filter({ hasText: "Night bus" });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const play = card.getByRole("button", { name: /^Play Night bus/ });
  const pause = card.getByRole("button", { name: /^Pause Night bus/ });
  expect(await largestStep(page, () => play.click())).toBeLessThan(MAX_STEP);
  await expect(pause).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await largestStep(page, () => pause.click())).toBeLessThan(MAX_STEP);
});
