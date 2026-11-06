import { expect, type Page, test } from "@playwright/test";
import { pageIn, signInWithMagicLink } from "./helpers";

// Mia edits and deletes her own comment on Jonas's track. With a reply
// under it, it stays as "Comment deleted" until the reply goes too.
const trackPath = "/t/rain-on-the-roof-seed0005";
const stamp = Date.now().toString(36);
const first = `The bass sits a bit low ${stamp}`;
const edited = `The bass sits a bit low under the vocal ${stamp}`;
const answer = `Agreed, I'll lift it ${stamp}`;

/** The count beside the Comments heading. */
function allCount(page: Page) {
  return page
    .getByRole("heading", { name: /^Comments/ })
    .innerText()
    .then((text) => Number(text.replace(/\D+/g, "")));
}

function menuFor(page: Page, text: string) {
  return page
    .getByRole("listitem")
    .filter({ hasText: text })
    .last()
    .getByRole("button", { name: /More actions for the comment/ })
    .first();
}

test("edit, delete and a deleted comment that keeps its replies", async ({
  browser,
}) => {
  const mia = await (await browser.newContext()).newPage();
  const jonas = await (await browser.newContext()).newPage();

  await signInWithMagicLink(mia, "mia@example.com", trackPath);
  const before = await allCount(mia);
  await mia.getByLabel("Comment", { exact: true }).fill(first);
  await mia.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(mia.getByText(first)).toBeVisible();

  await test.step("her own comment has Edit and Delete, not Report", async () => {
    await menuFor(mia, first).click();
    await expect(mia.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(mia.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await expect(
      mia.getByRole("menuitem", { name: "Report comment" }),
    ).toHaveCount(0);
    await mia.getByRole("menuitem", { name: "Edit" }).click();
    const box = mia.getByLabel("Edit your comment");
    await box.fill(edited);
    await mia.getByRole("button", { name: "Save" }).click();
    await expect(mia.getByText(edited)).toBeVisible();
    const row = mia.getByRole("listitem").filter({ hasText: edited }).last();
    await expect(row.getByText(/· edited$/)).toBeVisible();
    // Stored.
    await mia.reload();
    await pageIn(mia);
    await expect(mia.getByText(edited)).toBeVisible();
  });

  await test.step("Jonas replies, and only has Report on hers", async () => {
    await signInWithMagicLink(jonas, "jonas@example.com", trackPath);
    const thread = jonas.getByRole("listitem").filter({ hasText: edited });
    await menuFor(jonas, edited).click();
    await expect(
      jonas.getByRole("menuitem", { name: "Report comment" }),
    ).toBeVisible();
    await expect(jonas.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
    await jonas.keyboard.press("Escape");
    await thread.first().getByRole("button", { name: "Reply" }).click();
    await jonas.getByLabel("Reply to Mia K").fill(answer);
    await thread.first().getByRole("button", { name: "Reply" }).click();
    await expect(jonas.getByText(answer)).toBeVisible();
  });

  await test.step("Mia deletes it: the reply stays under Comment deleted", async () => {
    await mia.reload();
    await pageIn(mia);
    // The reloaded page, with the reply in it.
    await expect(mia.getByText(answer)).toBeVisible();
    await menuFor(mia, edited).click();
    await mia.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = mia.getByRole("dialog", { name: "Delete comment?" });
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();
    await expect(mia.getByText(edited)).toHaveCount(0);
    const kept = mia
      .getByRole("listitem")
      .filter({ hasText: "Comment deleted" })
      .filter({ hasText: answer });
    await expect(kept).toBeVisible();
    expect(await allCount(mia)).toBe(before);

    // The same for everyone else, with nothing to act on.
    await jonas.reload();
    await pageIn(jonas);
    const gone = jonas
      .getByRole("listitem")
      .filter({ hasText: "Comment deleted" })
      .filter({ hasText: answer })
      .first();
    await expect(gone).toBeVisible();
    await expect(gone.getByText(answer)).toBeVisible();
    await expect(gone.getByRole("button", { name: /^Reply$/ })).toHaveCount(0);
  });

  await test.step("once the reply goes, so does Comment deleted", async () => {
    await menuFor(jonas, answer).click();
    await jonas.getByRole("menuitem", { name: "Delete" }).click();
    await jonas
      .getByRole("dialog", { name: "Delete reply?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(jonas.getByText(answer)).toHaveCount(0);
    await expect(
      jonas.getByText("Comment deleted", { exact: true }),
    ).toHaveCount(0);
    await jonas.reload();
    await pageIn(jonas);
    await expect(
      jonas.getByText("Comment deleted", { exact: true }),
    ).toHaveCount(0);
  });
});
