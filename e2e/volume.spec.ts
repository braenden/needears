import { expect, test } from "@playwright/test";

// The volume slider on a track page is kept in the browser and comes back
// on the next track.
test.use({ viewport: { width: 1280, height: 900 } });

test("the volume is remembered from track to track", async ({ page }) => {
  await page.goto("/t/night-bus-seed0002");
  const volume = page.getByRole("slider", { name: "Volume" });
  await expect(volume).toHaveValue("100");
  // The arrow keys change the volume here, they do not seek.
  await volume.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
  await expect(volume).toHaveValue("80");

  await page.goto("/t/first-light-demo-seed0001");
  await expect(page.getByRole("slider", { name: "Volume" })).toHaveValue("80");
});
