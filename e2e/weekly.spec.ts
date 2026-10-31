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

  test("the weekly list is a row under the tabs on a phone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/feed");
    await expect(
      page.getByRole("complementary", { name: "This week" }),
    ).toBeHidden();
    await expect(
      page.getByText("Most helpful ears this week").first(),
    ).toBeVisible();
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
