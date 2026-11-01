import { expect, test } from "@playwright/test";

// A slow page shows a thin progress line at the top until it is in, and a
// quick one never flashes it.
test("a slow navigation shows the progress line until the page is in", async ({
  page,
}) => {
  await page.goto("/feed?tab=latest");
  // The line starts watching clicks once the page has hydrated.
  await page.waitForLoadState("networkidle");
  const line = page.locator("[data-phase]");
  await expect(line).toHaveAttribute("data-phase", "idle");

  // Hold back everything for track pages, prefetches included.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/t/**", async (route) => {
    await held;
    await route.continue();
  });

  // The title is the card's link to the track.
  await page
    .locator("main article")
    .first()
    .getByRole("heading")
    .getByRole("link")
    .click();
  await expect(line).toHaveAttribute("data-phase", "loading");
  release();
  await expect(page).toHaveURL(/\/t\//);
  await expect(line).toHaveAttribute("data-phase", "idle");
});
