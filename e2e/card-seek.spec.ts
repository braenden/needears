import { expect, type Page, test } from "@playwright/test";

// A card's waveform is a seek bar for the shared player, and its comment
// count opens the track at its comments. Night bus is 18 seconds long.
// Night bus is House. Filtered, the feed shows it on the first page however
// many tracks earlier runs have uploaded.
const FEED = "/feed?tab=latest&genre=house";
const card = (page: Page) =>
  page.getByRole("listitem").filter({ hasText: "Night bus" });
const bar = (page: Page) =>
  card(page).getByRole("slider", { name: "Seek in Night bus" });
const now = async (page: Page) =>
  Number(await bar(page).getAttribute("aria-valuenow"));

test.describe("with a mouse and the keyboard", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a click plays from that spot, keys move it", async ({ page }) => {
    await page.goto(FEED);
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

    // Nothing follows the pointer: hovering adds nothing to the bar.
    const hover = (await bar(page).boundingBox())!;
    await page.mouse.move(hover.x + hover.width * 0.3, hover.y + 10);
    await expect(bar(page).locator("span")).toHaveCount(0);

    // A second click elsewhere plays from there; nothing drags.
    const box = (await bar(page).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
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
    // Plays on from 5 seconds: from the start it could not get there this
    // quickly. Polled, since the first reading can come before the seek.
    await expect
      .poll(() => now(page), { timeout: 2000 })
      .toBeGreaterThanOrEqual(5);
  });

  test("the comment count opens the track at its comments", async ({
    page,
  }) => {
    await page.goto(FEED);
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
    await page.goto(FEED);
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
    await page.goto(FEED);
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
  await page.goto(FEED);
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

test("a swipe over a card's waveform scrolls the page and plays nothing", async ({
  browser,
}) => {
  const context = await browser.newContext({
    // Short, so the page has room to scroll.
    viewport: { width: 375, height: 480 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(FEED);
  await bar(page).scrollIntoViewIfNeeded();
  const box = (await bar(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const before = await page.evaluate(() => window.scrollY);
  // Swipe towards where the page can still scroll (the list may be short).
  const room = await page.evaluate(
    () =>
      document.documentElement.scrollHeight -
      window.innerHeight -
      window.scrollY,
  );
  const dy = room > 120 ? -25 : 25;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + i * 4, y: y + i * dy }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
  await expect(
    card(page).getByRole("button", { name: /^Play Night bus/ }),
  ).toBeVisible();
  await context.close();
});

test("a click on the waveform right after Play is not lost", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/u/nora");
  await bar(page).scrollIntoViewIfNeeded();
  // Wait for the page to hydrate: the slider is focusable then.
  await expect(async () => {
    await bar(page).focus();
    await expect(bar(page)).toBeFocused({ timeout: 500 });
  }).toPass();
  await card(page)
    .getByRole("button", { name: /^Play Night bus/ })
    .click();
  await page.waitForTimeout(100);
  const box = (await bar(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
  // Night bus is 18 seconds: about 12.6 seconds in, not from the start.
  await expect.poll(() => now(page)).toBeGreaterThanOrEqual(12);
  expect(await now(page)).toBeLessThanOrEqual(15);
  await expect(
    card(page).getByRole("button", { name: /^Pause Night bus/ }),
  ).toBeVisible();
});
