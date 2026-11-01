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
