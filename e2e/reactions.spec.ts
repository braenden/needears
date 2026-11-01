import { expect, type Page, test } from "@playwright/test";
import { signInWithMagicLink, pageIn } from "./helpers";

// One reaction per person on a seed track: pick one, switch to another, take
// it back, and the track list shows the new count when going back to it.
// Nora's profile lists the track whatever else the feed holds.
const handle = `e2e_r_${Date.now().toString(36)}`;
const title = "Night bus";
const listPath = "/u/nora";

/** The reactions on the track page, as kind label => count. */
async function counts(page: Page) {
  const group = page.getByRole("group", { name: "React to this track" });
  const labels = await group
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute("aria-label") ?? ""),
    );
  return Object.fromEntries(
    labels.map((label) => {
      const [name, count] = label.split(", ");
      return [name, Number(count)];
    }),
  );
}

function pressed(page: Page) {
  return page
    .getByRole("group", { name: "React to this track" })
    .locator('[aria-pressed="true"]');
}

/** Clicks a reaction and waits until the database has it. */
async function react(page: Page, name: string | RegExp, method: string) {
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/rest/v1/reactions") && r.request().method() === method,
  );
  await page.getByRole("button", { name }).click();
  expect((await saved).ok()).toBe(true);
}

function card(page: Page) {
  return page.getByRole("article", { name: title });
}

function total(c: Record<string, number>) {
  return Object.values(c).reduce((sum, n) => sum + n, 0);
}

function reactionText(n: number) {
  return `${n} ${n === 1 ? "reaction" : "reactions"}`;
}

test("one reaction per person, and track lists keep up", async ({ page }) => {
  await signInWithMagicLink(page, `${handle}@example.com`, listPath);
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByLabel("Username").fill(handle);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(new RegExp(`${listPath}$`));

  await card(page).getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/t\/night-bus-seed0002$/);
  await pageIn(page);
  await expect(pressed(page)).toHaveCount(0);
  const before = await counts(page);

  await test.step("picks Fire", async () => {
    await react(page, `Fire, ${before.Fire}`, "POST");
    await expect(pressed(page)).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: `Fire, ${before.Fire + 1}` }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("switching moves the reaction", async () => {
    await react(page, `Love, ${before.Love}`, "PATCH");
    await expect(
      page.getByRole("button", { name: `Love, ${before.Love + 1}` }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: `Fire, ${before.Fire}` }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(pressed(page)).toHaveCount(1);
  });

  await test.step("stored as one reaction", async () => {
    await page.reload();
    await expect(pressed(page)).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: `Love, ${before.Love + 1}` }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(total(await counts(page))).toBe(total(before) + 1);
  });

  await test.step("going back to the list shows the new count", async () => {
    await page.goto(listPath);
    await card(page).getByRole("link", { name: title }).click();
    await expect(page).toHaveURL(/\/t\/night-bus-seed0002$/);
    await pageIn(page);
    await pageIn(page);
    await react(page, /^Love, /, "DELETE");
    await expect(pressed(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${listPath}$`));
    const listed = card(page);
    if (total(before) === 0) {
      await expect(listed.getByText(/\d+ reactions?$/)).toBeHidden();
    } else {
      await expect(listed.getByText(reactionText(total(before)))).toBeVisible();
    }
  });
});
