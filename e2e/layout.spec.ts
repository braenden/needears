import { expect, test, type Page } from "@playwright/test";
import { pageIn, signInWithMagicLink } from "./helpers";

// The page frame: wide pages start under the logo, narrow pages share one
// left edge, and a page's title has one size and one height, so nothing
// moves sideways or up and down when going from page to page.
const TRACK = "/t/night-bus-seed0002";

/** Where the logo starts: the left edge of the top bar's content. */
async function logoLeft(page: Page) {
  const box = await page.locator("header a svg").first().boundingBox();
  if (!box) throw new Error("No logo");
  return box.x;
}

/** Where the top bar's content ends on the right. */
async function barRight(page: Page) {
  return page.locator("header > div").evaluate((bar) => {
    const box = bar.getBoundingClientRect();
    return box.right - parseFloat(getComputedStyle(bar).paddingRight);
  });
}

/** The page's visible title: where it is and how big its type is. */
async function title(page: Page) {
  const heading = page.locator("main h1:visible").first();
  const box = await heading.boundingBox();
  if (!box) throw new Error(`No title on ${page.url()}`);
  const style = await heading.evaluate((el) => {
    const computed = getComputedStyle(el);
    return { size: computed.fontSize, align: computed.textAlign };
  });
  return { ...box, ...style };
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await pageIn(page);
}

for (const width of [1280, 1920]) {
  test.describe(`home page at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("starts under the logo and is as wide as the top bar", async ({
      page,
    }) => {
      await open(page, "/");
      const left = await logoLeft(page);
      const heading = await title(page);
      expect(Math.abs(heading.x - left)).toBeLessThan(1);

      // A real track beside the intro, out to the top bar's right edge.
      const track = page.locator("main article").first();
      const box = (await track.boundingBox())!;
      expect(box.x).toBeGreaterThan(heading.x + heading.width - 1);
      expect(Math.abs(box.x + box.width - (await barRight(page)))).toBeLessThan(
        1,
      );
      await expect(
        track.getByRole("button", { name: "Play", exact: true }),
      ).toBeVisible();
      await expect(
        track.getByRole("group", { name: "Comment markers" }),
      ).toBeVisible();

      // The trending rows under it use the whole width, as in the feed.
      const row = (await page
        .getByRole("list", { name: "Trending tracks" })
        .boundingBox())!;
      expect(Math.abs(row.x - left)).toBeLessThan(1);
      expect(Math.abs(row.x + row.width - (await barRight(page)))).toBeLessThan(
        1,
      );
    });
  });
}

test.describe("home page", () => {
  test("its track plays, and stops when a trending track starts", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, "/");
    const track = page.locator("main article").first();
    const play = track.getByRole("button", { name: "Play", exact: true });
    const pause = track.getByRole("button", { name: "Pause", exact: true });
    // A time under the player plays from there.
    await expect(async () => {
      await track
        .getByRole("button", { name: /^Play from / })
        .first()
        .click();
      await expect(pause).toBeVisible({ timeout: 2000 });
    }).toPass();

    const row = page
      .getByRole("list", { name: "Trending tracks" })
      .getByRole("listitem")
      .first();
    await row.getByRole("button", { name: /^Play / }).click();
    await expect(row.getByRole("button", { name: /^Pause / })).toBeVisible();
    await expect(play).toBeVisible();

    // And the other way round.
    await play.click();
    await expect(pause).toBeVisible();
    await expect(row.getByRole("button", { name: /^Play / })).toBeVisible();
  });

  test("on a phone it is one column and does not scroll sideways", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, "/");
    const heading = await title(page);
    const track = (await page.locator("main article").first().boundingBox())!;
    expect(track.y).toBeGreaterThan(heading.y + heading.height);
    expect(Math.abs(track.x - heading.x)).toBeLessThan(1);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});

test.describe("page frame", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("wide pages start under the logo", async ({ page }) => {
    for (const path of ["/", "/feed", TRACK, "/u/nora", "/search"]) {
      await open(page, path);
      const left = await logoLeft(page);
      const first = await page
        .locator("main > :not([hidden])")
        .first()
        .evaluate(
          (el) =>
            el.getBoundingClientRect().left +
            parseFloat(getComputedStyle(el).paddingLeft),
        );
      expect(Math.abs(first - left), path).toBeLessThan(1);
    }
  });

  test("narrow pages share a left edge, and every title has one size and height", async ({
    page,
  }) => {
    await open(page, TRACK);
    const wide = await title(page);
    expect(wide.size).toBe("36px");

    await signInWithMagicLink(page, "nora@example.com", "/settings");
    const settings = await title(page);
    for (const path of ["/about", "/terms", "/notifications"]) {
      await open(page, path);
      const narrow = await title(page);
      expect(narrow.x, path).toBeCloseTo(settings.x, 1);
      expect(narrow.y, path).toBeCloseTo(wide.y, 1);
      expect(narrow.size, path).toBe(wide.size);
    }
    expect(settings.y).toBeCloseTo(wide.y, 1);
    expect(settings.size).toBe(wide.size);
    // Narrow pages sit in the middle, further in than the logo.
    expect(settings.x).toBeGreaterThan(await logoLeft(page));

    // The upload page's heading is its title in every step.
    await open(page, "/upload");
    const upload = (await page
      .getByRole("heading", { name: "Upload a track", level: 2 })
      .boundingBox())!;
    expect(upload.x).toBeCloseTo(settings.x, 1);
    expect(upload.y).toBeCloseTo(settings.y, 1);
  });

  test("sign in and picking a username are framed alike", async ({ page }) => {
    await open(page, "/login");
    const signIn = await title(page);
    await signInWithMagicLink(page, "nora@example.com", "/welcome");
    await expect(page).toHaveURL(/\/welcome/);
    const username = await title(page);
    expect(username.y).toBeCloseTo(signIn.y, 1);
    expect(username.size).toBe(signIn.size);
    // Both centred under the top bar.
    const bar = (await page.locator("header > div").boundingBox())!;
    const middle = bar.x + bar.width / 2;
    for (const heading of [signIn, username]) {
      expect(heading.align).toBe("center");
      expect(Math.abs(heading.x + heading.width / 2 - middle)).toBeLessThan(1);
    }
  });
});
