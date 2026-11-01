import { expect, test } from "@playwright/test";

// The weekly list on the feed and badges next to names in the comments,
// both from the seed data, signed out.
test.describe("weekly list and badges", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the feed has the weekly list in its side column", async ({ page }) => {
    await page.goto("/feed");
    const week = page.getByRole("complementary", { name: "This week" });
    await expect(week.getByText("Most helpful ears this week")).toBeVisible();
    // Which names are on it depends on the day the seed ran, so either
    // someone links to a profile or the empty state invites a comment.
    await expect(
      week
        .getByRole("link", { name: /.+/ })
        .first()
        .or(week.getByText(/Nobody has been marked Helpful yet this week/)),
    ).toBeVisible();
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

  test("on a phone the weekly list is a row above the tracks", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/feed");
    await expect(
      page.getByRole("complementary", { name: "This week" }),
    ).toBeHidden();
    // Shown once someone is on it this week, which depends on the day the
    // seed ran.
    const heading = page.getByText("Most helpful ears this week");
    if ((await heading.count()) > 0) {
      const row = await heading.first().boundingBox();
      const track = await page.locator("main article").first().boundingBox();
      expect(row!.y).toBeLessThan(track!.y);
    }
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
