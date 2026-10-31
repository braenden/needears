import { expect, test } from "@playwright/test";

// Search from the top bar, signed out, against the seed data.
test.describe("search", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("/ jumps to the search box and finds a track", async ({ page }) => {
    await page.goto("/feed");
    const box = page
      .getByRole("search", { name: "Search" })
      .getByRole("searchbox");
    // The shortcut works once the page has hydrated.
    await expect(async () => {
      await page.locator("main").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("/");
      await expect(box).toBeFocused({ timeout: 1000 });
    }).toPass();
    await page.keyboard.type("night");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=night$/);
    await expect(page.getByRole("link", { name: /Night bus/ })).toHaveAttribute(
      "href",
      "/t/night-bus-seed0002",
    );
  });

  test("finds people, and explains short and empty searches", async ({
    page,
  }) => {
    await page.goto("/search?q=jonas");
    await expect(
      page.getByRole("link", { name: /Jonas Berg/ }).first(),
    ).toHaveAttribute("href", "/u/jonas");

    await page.goto("/search?q=ab");
    await expect(page.getByText(/Type at least 3 characters/)).toBeVisible();

    await page.goto("/search?q=zzzqqqxxx");
    await expect(page.getByText(/Nothing found for/)).toBeVisible();
  });
});
