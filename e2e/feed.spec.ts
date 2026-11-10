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

  test("the tracks start under the logo, end where the top bar ends, and start at the same place on every tab", async ({
    page,
  }) => {
    const tops: number[] = [];
    for (const tab of ["needs-ears", "latest", "trending"]) {
      await page.goto(`/feed?tab=${tab}`);
      const box = await page.locator("main article").first().boundingBox();
      const logo = await page.locator("header a svg").first().boundingBox();
      if (!box || !logo) throw new Error(`No track on ${tab}`);
      expect(Math.abs(box.x - logo.x)).toBeLessThan(1);
      // The top bar's content, inside its padding.
      const right = await page.locator("header > div").evaluate((bar) => {
        const edge = bar.getBoundingClientRect().right;
        return edge - parseFloat(getComputedStyle(bar).paddingRight);
      });
      expect(Math.abs(box.x + box.width - right)).toBeLessThan(1);
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

  test("badges are on the profile, not beside every comment", async ({
    page,
  }) => {
    await page.goto("/t/night-bus-seed0002");
    await expect(
      page.getByRole("list", { name: "Comments" }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Comments" })
        .getByRole("list", { name: "Badges" }),
    ).toHaveCount(0);
    await page.goto("/u/mia?tab=about");
    await expect(
      page
        .getByRole("list", { name: "Badges" })
        .getByRole("button", { name: "First ears" }),
    ).toBeVisible();
  });
});

test("rows carry no Needs ears badge: the tab says it", async ({ page }) => {
  for (const tab of ["needs-ears", "latest"]) {
    await page.goto(`/feed?tab=${tab}`);
    await expect(page.locator("main article").first()).toBeVisible();
    await expect(
      page.locator("main article").getByText("Needs ears", { exact: true }),
    ).toHaveCount(0);
  }
});
