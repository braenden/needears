import { expect, test } from "@playwright/test";
import { signInWithMagicLink } from "./helpers";

// Replies and Resolved on a seed track: Jonas comments on Nora's track,
// Nora replies and marks it resolved, Jonas gets told about the reply.
const trackPath = "/t/night-bus-seed0002";
const stamp = Date.now().toString(36);
const question = `Is the hi-hat panned on purpose? ${stamp}`;
const answer = `Yes, it moves left in the second half. ${stamp}`;

test("reply, resolve, Show resolved in the URL and the reply notice", async ({
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

    await thread
      .first()
      .getByRole("button", { name: "Mark as resolved" })
      .click();
    await expect(
      thread.first().getByRole("button", { name: "Reopen" }),
    ).toBeVisible();

    // Stored, not just shown.
    await nora.reload();
    await expect(
      nora
        .getByRole("listitem")
        .filter({ hasText: question })
        .first()
        .getByRole("button", { name: "Reopen" }),
    ).toBeVisible();
  });

  await test.step("hiding resolved comments is kept in the URL", async () => {
    await nora.getByRole("checkbox", { name: /Show resolved/ }).uncheck();
    await expect(nora.getByText(question)).toBeHidden();
    await expect(nora).toHaveURL(/resolved=hide/);
    await nora.reload();
    await expect(nora.getByText(question)).toBeHidden();
    await expect(
      nora.getByRole("checkbox", { name: /Show resolved/ }),
    ).not.toBeChecked();
  });

  await test.step("Jonas sees the reply under Notifications", async () => {
    await jonas.goto("/notifications");
    await expect(
      jonas.getByText(/replied to your comment on/).first(),
    ).toBeVisible();
  });

  await test.step("Jonas switches email and it stays switched", async () => {
    await jonas.goto("/settings");
    const email = jonas.getByRole("checkbox", {
      name: /Email me about new comments/,
    });
    // Toggle from whatever it is now, check it after a reload, then put it
    // back, so a failed earlier run cannot break this one.
    const before = await email.isChecked();
    await email.setChecked(!before);
    await expect(
      jonas.getByText(before ? "Email is off." : "Email is on."),
    ).toBeVisible();
    await jonas.reload();
    await expect(email).toBeChecked({ checked: !before });
    await email.setChecked(true);
    await expect(email).toBeChecked();
  });
});
