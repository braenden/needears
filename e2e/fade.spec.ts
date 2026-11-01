import { expect, type Page, test } from "@playwright/test";
import { pageIn } from "./helpers";

// Play, pause and seek fade the volume, so the sound does not click. A
// hook on the element's volume records the largest single change while
// sound plays: a fade moves in small steps (about 0.2), a cut jumps from
// 1 to 0. On a 4 times slower CPU, so a busy page cannot hide a cut.
const MAX_STEP = 0.4;

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const volume = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "volume",
    )!;
    const w = window as unknown as { __jump: number };
    w.__jump = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "volume", {
      configurable: true,
      get() {
        return volume.get!.call(this);
      },
      set(value: number) {
        const before = volume.get!.call(this) as number;
        volume.set!.call(this, value);
        // Only what can be heard: changes while it plays.
        if (!(this as HTMLMediaElement).paused)
          w.__jump = Math.max(w.__jump, Math.abs(value - before));
      },
    });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
});

/** The largest volume step while `action` plays out. */
async function largestStep(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    (window as unknown as { __jump: number }).__jump = 0;
  });
  await action();
  await page.waitForTimeout(800);
  return page.evaluate(() => (window as unknown as { __jump: number }).__jump);
}

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
