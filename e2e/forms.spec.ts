import { expect, test } from "@playwright/test";
import { signInWithMagicLink, testWav } from "./helpers";

// A form that does not go through puts focus on the first field that needs
// fixing, with it in sight.

test("signing in without an email focuses the email field", async ({
  page,
}) => {
  await page.goto("/login");
  const email = page.getByLabel("Email", { exact: true });
  await expect(async () => {
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(email).toBeFocused({ timeout: 1000 });
  }).toPass();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Continue without a genre focuses the genre", async ({ page }) => {
    await signInWithMagicLink(page, "nora@example.com", "/upload");
    await page.locator('input[type="file"]').setInputFiles({
      name: "focus.wav",
      mimeType: "audio/wav",
      buffer: testWav(3),
    });
    await page.getByLabel("Title").fill("Focus check");
    await page.getByRole("button", { name: "Continue" }).click();
    const genre = page.getByLabel("Genre");
    await expect(genre).toBeFocused();
    await expect(genre).toBeInViewport();
  });
});
