import { expect, test } from "@playwright/test";
import { pageIn } from "./helpers";

// On a phone the full player scrolls away with the page, and a slim bar
// takes over under the header.
test.use({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
});

test("a slim player bar takes over once the player scrolls away", async ({
  page,
}) => {
  await page.goto("/t/night-bus-seed0002");
  await pageIn(page);
  const bar = page.locator('[data-slot="mini-player"]');
  await expect(bar).toHaveCSS("opacity", "0");

  await page.evaluate(() => window.scrollBy(0, 600));
  await expect(bar).toHaveCSS("opacity", "1");
  const box = (await bar.boundingBox())!;
  expect(box.height).toBe(64);

  await expect(async () => {
    await bar.getByRole("button", { name: "Play", exact: true }).tap();
    await expect(
      bar.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible({
      timeout: 2000,
    });
  }).toPass();
  await bar.getByRole("button", { name: "Pause", exact: true }).tap();
  await expect(
    bar.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();

  await bar.getByRole("button", { name: /Show the full player/ }).tap();
  await expect(bar).toHaveCSS("opacity", "0");
});

test("comment previews stay on the screen wherever the marker is", async ({
  page,
}) => {
  // Few comments, spread out: each has a marker of its own.
  await page.goto("/t/old-tape-seed0010");
  await pageIn(page);
  const markers = page
    .getByRole("group", { name: "Comment markers" })
    .locator("button");
  const screen = page.viewportSize()!.width;
  let seen = 0;
  for (const marker of await markers.all()) {
    await marker.focus();
    const tip = page.getByRole("tooltip");
    if ((await tip.count()) === 0) continue;
    seen += 1;
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(7.5);
    expect(box.x + box.width).toBeLessThanOrEqual(screen - 7.5);
    // Nothing sticks out, so the page does not get wider.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(screen);
  }
  expect(seen).toBeGreaterThan(1);
});

test("the track menu keeps off the edge of the screen", async ({ page }) => {
  await page.goto("/t/night-bus-seed0002");
  await pageIn(page);
  await expect(async () => {
    await page.getByRole("button", { name: "More for this track" }).tap();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 2000 });
  }).toPass();
  const box = (await page.getByRole("menu").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width - 8);
});
