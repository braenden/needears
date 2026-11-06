import { test } from "@playwright/test";
import { pageIn, signInWithMagicLink } from "./helpers";
const path = "/t/rain-on-the-roof-seed0005";
test("flow", async ({ browser }) => {
  const mia = await (await browser.newContext()).newPage();
  const jonas = await (await browser.newContext()).newPage();
  await signInWithMagicLink(mia, "mia@example.com", path);
  await signInWithMagicLink(jonas, "jonas@example.com", path);
  for (let i = 0; i < 4; i++) {
    const stamp = Date.now().toString(36);
    await mia.getByLabel("Comment", { exact: true }).fill(`probe ${stamp}`);
    await mia.getByRole("button", { name: "Comment", exact: true }).click();
    await mia.getByText(`probe ${stamp}`).waitFor();
    await jonas.reload(); await pageIn(jonas);
    const thread = jonas.getByRole("listitem").filter({ hasText: `probe ${stamp}` });
    await thread.first().getByRole("button", { name: "Reply" }).click();
    await jonas.getByLabel("Reply to Mia K").fill(`answer ${stamp}`);
    await thread.first().getByRole("button", { name: "Reply" }).click();
    await jonas.getByText(`answer ${stamp}`).waitFor();
    const { execSync } = await import("node:child_process");
    console.log("DB right after", execSync(`docker exec supabase_db_needears-fe psql -U postgres -tAc "select count(*) from comments where body = 'answer ${stamp}'"`).toString().trim());
    await mia.reload(); await pageIn(mia); await mia.waitForTimeout(2500);
    const dom = await mia.content();
    console.log("RUN", i, "html has probe", dom.includes(`probe ${stamp}`), "answer", dom.includes(`answer ${stamp}`), "visible", await mia.getByText(`answer ${stamp}`).isVisible());
  }
});
