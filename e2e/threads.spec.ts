import { expect, test } from "@playwright/test";
import { signInWithMagicLink } from "./helpers";

// Replies and Resolved on a seed track: Jonas comments on Nora's track,
// Nora replies and marks it resolved, Jonas gets told about the reply.
const trackPath = "/t/night-bus-seed0002";
const stamp = Date.now().toString(36);
const question = `Is the hi-hat panned on purpose? ${stamp}`;
const answer = `Yes, it moves left in the second half. ${stamp}`;

test("reply, resolve, resolved comments in the URL and the reply notice", async ({
  browser,
}) => {
  const jonas = await (await browser.newContext()).newPage();
  const nora = await (await browser.newContext()).newPage();

  await test.step("Jonas comments on Nora's track", async () => {
    await signInWithMagicLink(jonas, "jonas@example.com", trackPath);
    await jonas.getByLabel("Comment", { exact: true }).fill(question);
    await jonas.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(jonas.getByText(question)).toBeVisible();
  });

  await test.step("Nora replies and marks it resolved", async () => {
    await signInWithMagicLink(nora, "nora@example.com", trackPath);
    const thread = nora.getByRole("listitem").filter({ hasText: question });
    await thread.first().getByRole("button", { name: "Reply" }).click();
    await nora.getByLabel("Reply to Jonas Berg").fill(answer);
    await thread.first().getByRole("button", { name: "Reply" }).click();
    await expect(nora.getByText(answer)).toBeVisible();

    // Resolved from the comment's menu: it goes to the bottom, folded.
    await thread
      .first()
      .getByRole("button", { name: /More actions for the comment by Jonas/ })
      .click();
    await nora.getByRole("menuitem", { name: "Mark as resolved" }).click();
    await expect(nora.getByText(question)).toBeHidden();
  });

  await test.step("showing resolved comments is kept in the URL", async () => {
    await nora
      .getByRole("button", { name: /^\d+ resolved comments?$/ })
      .click();
    await expect(nora.getByText(question)).toBeVisible();
    await expect(nora).toHaveURL(/resolved=show/);
    // Stored, not just shown.
    await nora.reload();
    await expect(nora.getByText(question)).toBeVisible();
    await nora
      .getByRole("listitem")
      .filter({ hasText: question })
      .first()
      .getByRole("button", { name: /More actions for the comment by Jonas/ })
      .click();
    await expect(nora.getByRole("menuitem", { name: "Reopen" })).toBeVisible();
    await nora.keyboard.press("Escape");
  });

  await test.step("Jonas sees the reply under Notifications", async () => {
    await jonas.goto("/notifications");
    await expect(
      jonas.getByText(/replied (\d+ times )?to your comments? on/).first(),
    ).toBeVisible();
    // The whole row opens the track, not only its title.
    const row = jonas
      .getByRole("listitem")
      .filter({ hasText: /replied (\d+ times )?to your comments? on/ })
      .first();
    const box = (await row.boundingBox())!;
    await jonas.mouse.click(box.x + box.width - 20, box.y + box.height - 10);
    await expect(jonas).toHaveURL(/\/t\/night-bus-seed0002/);
  });
});
