import { expect, test } from "@playwright/test";

// The feed's layout, and badges next to names in the comments, from the
// seed data, signed out.
test.describe("feed layout and badges", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the feed is all tracks, without a weekly list", async ({ page }) => {
    await page.goto("/feed");
    await expect(page.locator("main article").first()).toBeVisible();
    await expect(page.getByText("Most helpful ears this week")).toHaveCount(0);
    await expect(page.getByRole("complementary")).toHaveCount(0);
  });

  test("the tracks are centered under the header and start at the same place on every tab", async ({
    page,
  }) => {
    const tops: number[] = [];
    for (const tab of ["needs-ears", "latest", "trending"]) {
      await page.goto(`/feed?tab=${tab}`);
      const box = await page.locator("main article").first().boundingBox();
      const header = await page.locator("header > div").first().boundingBox();
      if (!box || !header) throw new Error(`No track on ${tab}`);
      const middle = header.x + header.width / 2;
      expect(Math.abs(box.x + box.width / 2 - middle)).toBeLessThan(1);
      tops.push(box.y);
    }
    expect(new Set(tops).size).toBe(1);
  });

  test("on a phone the feed does not scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/feed");
    await expect(page.locator("main article").first()).toBeVisible();
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width).toBeLessThanOrEqual(375);
  });

  test("comments show the author's badges", async ({ page }) => {
    await page.goto("/t/night-bus-seed0002");
    await expect(
      page
        .getByRole("list", { name: "Badges" })
        .getByRole("button", { name: "First ears" })
        .first(),
    ).toBeVisible();
  });
});
