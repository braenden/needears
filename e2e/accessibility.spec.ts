import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signInWithMagicLink } from "./helpers";

// axe-core against the main pages, in both themes. Serious and critical
// violations of WCAG 2.1 A and AA fail the test; minor and moderate ones are
// left to Lighthouse and review.
const TRACK = "/t/first-light-demo-seed0001";
const SIGNED_OUT = ["/", "/feed", TRACK, "/login"];
const SIGNED_IN = ["/upload", "/settings"];

async function expectNoSeriousViolations(page: Page) {
  // Let entrance animations finish so colors are measured at rest.
  await page.waitForTimeout(500);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
    }));
  expect(serious).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const path of SIGNED_OUT) {
      test(`${path} has no serious accessibility violations`, async ({
        page,
      }) => {
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
        await expectNoSeriousViolations(page);
      });
    }

    test.describe("signed in", () => {
      test.describe.configure({ mode: "serial" });
      let context: BrowserContext;
      let page: Page;

      test.beforeAll(async ({ browser }) => {
        // AxeBuilder needs a page from an explicit context.
        context = await browser.newContext({ colorScheme });
        page = await context.newPage();
        await signInWithMagicLink(page, "nora@example.com", "/feed");
        await expect(page).toHaveURL(/\/feed/);
      });

      test.afterAll(async () => {
        await context.close();
      });

      for (const path of SIGNED_IN) {
        test(`${path} has no serious accessibility violations`, async () => {
          await page.goto(path);
          await expect(page.locator("main")).toBeVisible();
          await expectNoSeriousViolations(page);
        });
      }
    });
  });
}
