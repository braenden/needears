import { expect, test } from "@playwright/test";
import { signInWithMagicLink } from "./helpers";

// A range comment, a reference track and the marker export, on a seed track.
const trackPath = "/t/night-bus-seed0002";
const trackId = "b0000000-0000-4000-8000-000000000002";
const stamp = Date.now().toString(36);
const text = `The pad swells nicely through here ${stamp}`;
const reference = "https://soundcloud.com/nora/reference";

test.use({ viewport: { width: 1280, height: 900 } });

test("range comment, reference track and marker export", async ({
  browser,
}) => {
  const nora = await (await browser.newContext()).newPage();
  const jonas = await (await browser.newContext()).newPage();

  await test.step("Nora adds a reference track", async () => {
    await signInWithMagicLink(nora, "nora@example.com", trackPath);
    await nora.getByRole("button", { name: "Edit details" }).click();
    const dialog = nora.getByRole("dialog");
    await dialog.getByLabel(/Reference track/).fill(reference);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    const link = nora.getByRole("link", { name: /Reference track/ });
    await expect(link).toHaveAttribute("href", reference);
    await expect(link).toHaveAttribute("rel", /nofollow/);
  });

  await test.step("Jonas drags a range and comments on it", async () => {
    await signInWithMagicLink(jonas, "jonas@example.com", trackPath);
    const wave = jonas.getByLabel("Seek in Night bus").locator("..");
    const box = (await wave.boundingBox())!;
    const y = box.y + box.height / 2;
    // The drag works once the player has hydrated.
    await expect(async () => {
      await jonas.mouse.move(box.x + box.width * 0.2, y);
      await jonas.mouse.down();
      await jonas.mouse.move(box.x + box.width * 0.4, y, { steps: 4 });
      await jonas.mouse.move(box.x + box.width * 0.6, y, { steps: 4 });
      await jonas.mouse.up();
      await expect(jonas.getByPlaceholder(/What do you hear from/)).toBeVisible(
        { timeout: 1000 },
      );
    }).toPass();
    await jonas.getByLabel("Comment", { exact: true }).fill(text);
    await jonas.getByRole("button", { name: "Comment", exact: true }).click();
    const item = jonas.getByRole("listitem").filter({ hasText: text }).first();
    await expect(item.getByText(/\d:\d\d to \d:\d\d/)).toBeVisible();
  });

  await test.step("the export has it as a marker", async () => {
    const response = await jonas.request.get(
      `/api/tracks/${trackId}/markers?format=reaper`,
    );
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(text);
  });
});
