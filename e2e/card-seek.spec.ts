import { expect, type Page, test } from "@playwright/test";

// A card's waveform is a seek bar for the shared player, and its comment
// count opens the track at its comments. Night bus is 18 seconds long.
const card = (page: Page) =>
  page.getByRole("listitem").filter({ hasText: "Night bus" });
const bar = (page: Page) =>
  card(page).getByRole("slider", { name: "Seek in Night bus" });
const now = async (page: Page) =>
  Number(await bar(page).getAttribute("aria-valuenow"));

test.describe("with a mouse and the keyboard", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("click and drag play from that spot, keys move it", async ({ page }) => {
    await page.goto("/feed?tab=latest");
    // Retried until the page has hydrated.
    await bar(page).scrollIntoViewIfNeeded();
    await expect(async () => {
      const box = (await bar(page).boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
      await expect(
        card(page).getByRole("button", { name: /^Pause Night bus/ }),
      ).toBeVisible({ timeout: 2000 });
    }).toPass();
    expect(await now(page)).toBeGreaterThanOrEqual(8);

    // Drag back towards the start.
    const box = (await bar(page).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.6, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.1, y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => now(page)).toBeLessThanOrEqual(4);

    // Paused, the keys move the playhead without starting it, and Space
    // or Enter plays, like any slider.
    await card(page)
      .getByRole("button", { name: /^Pause Night bus/ })
      .click();
    await bar(page).focus();
    await page.keyboard.press("Home");
    await expect.poll(() => now(page)).toBe(0);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => now(page)).toBe(5);
    await expect(bar(page)).toHaveAttribute("aria-valuetext", /of 18 seconds/);
    await expect(
      card(page).getByRole("button", { name: /^Play Night bus/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(
      card(page).getByRole("button", { name: /^Pause Night bus/ }),
    ).toBeVisible();
    expect(await now(page)).toBeGreaterThanOrEqual(5);
  });

  test("the comment count opens the track at its comments", async ({
    page,
  }) => {
    await page.goto("/feed?tab=latest");
    await card(page)
      .getByRole("link", { name: /comments?$/ })
      .click();
    await expect(page).toHaveURL(/\/t\/night-bus-seed0002#comments$/);
    await expectCommentsAtTop(page);
  });
});

test.describe("with a finger", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });

  test("a tap plays from that spot, without moving the page sideways", async ({
    page,
  }) => {
    await page.goto("/feed?tab=latest");
    await bar(page).scrollIntoViewIfNeeded();
    await expect(async () => {
      const box = (await bar(page).boundingBox())!;
      await page.touchscreen.tap(
        box.x + box.width * 0.75,
        box.y + box.height / 2,
      );
      await expect(
        card(page).getByRole("button", { name: /^Pause Night bus/ }),
      ).toBeVisible({ timeout: 2000 });
    }).toPass();
    expect(await now(page)).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  });

  test("the comment count lands below the sticky player", async ({ page }) => {
    await page.goto("/feed?tab=latest");
    await card(page)
      .getByRole("link", { name: /comments?$/ })
      .tap();
    await expect(page).toHaveURL(/#comments$/);
    await expectCommentsAtTop(page);
  });
});

/** The comments heading is near the top, and nothing sticks over it. */
async function expectCommentsAtTop(page: Page) {
  const heading = page.getByRole("heading", { name: "Comments", level: 2 });
  await expect(heading).toBeVisible();
  await expect
    .poll(() =>
      heading.evaluate((h) => {
        const box = h.getBoundingClientRect();
        const top = document.elementFromPoint(
          box.left + 4,
          box.top + box.height / 2,
        );
        return h.contains(top) && box.top < window.innerHeight / 2;
      }),
    )
    .toBe(true);
}

test("keys on a card that is not playing pick where Play starts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/feed?tab=latest");
  await bar(page).scrollIntoViewIfNeeded();
  await expect(async () => {
    await bar(page).focus();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await expect(bar(page)).toHaveAttribute("aria-valuenow", "13", {
      timeout: 1000,
    });
  }).toPass();
  await expect(
    card(page).getByRole("button", { name: /^Play Night bus/ }),
  ).toBeVisible();
  await card(page)
    .getByRole("button", { name: /^Play Night bus/ })
    .click();
  await expect(
    card(page).getByRole("button", { name: /^Pause Night bus/ }),
  ).toBeVisible();
  expect(await now(page)).toBeGreaterThanOrEqual(13);
});
