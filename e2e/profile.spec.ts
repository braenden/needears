import { expect, test } from "@playwright/test";
import { signInWithMagicLink } from "./helpers";

// Mia sets a photo, what she is working on, her DAW and a link, and they
// show on her public profile, with the photo served from Storage.
const stamp = Date.now().toString(36);
const workingOn = `Mixing a garage EP ${stamp}`;

test("photo, working on, DAW and links show on the profile", async ({
  page,
}) => {
  await test.step("Mia uploads and crops a photo", async () => {
    await signInWithMagicLink(page, "mia@example.com", "/settings/profile");
    await expect(
      page.getByRole("heading", { name: "Edit profile", level: 1 }),
    ).toBeVisible();
    // A generated picture, picked through the hidden file input. Retried
    // until the page has hydrated and the crop dialog opens.
    await expect(async () => {
      await pickPicture();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
    }).toPass();
    await page.getByRole("button", { name: "Save photo" }).click();
    await expect(page.getByText("Photo saved.")).toBeVisible();
  });

  async function pickPicture() {
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 600;
      const g = canvas.getContext("2d")!;
      g.fillStyle = "#5ec2f7";
      g.fillRect(0, 0, 900, 600);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png"),
      );
      const input =
        document.querySelector<HTMLInputElement>("input[type=file]")!;
      const files = new DataTransfer();
      files.items.add(new File([blob], "me.png", { type: "image/png" }));
      input.files = files.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  await test.step("Mia fills in her music details", async () => {
    await page.getByLabel(/Working on/).fill(workingOn);
    await page.getByLabel(/DAW/).fill("Bitwig");
    // Start from no links, whatever an earlier run left.
    const remove = page.getByRole("button", { name: /Remove link/ });
    while ((await remove.count()) > 0) await remove.first().click();
    await page.getByRole("button", { name: "Add a link" }).click();
    await page
      .getByLabel("Link 1 address")
      .fill("https://soundcloud.com/mia-k");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    // Saving goes back to the profile.
    await expect(page).toHaveURL(/\/u\/mia$/);
  });

  await test.step("everyone sees it on the profile", async () => {
    const visitor = await (
      await page.context().browser()!.newContext()
    ).newPage();
    await visitor.goto("/u/mia");
    await expect(visitor.getByText(workingOn)).toBeVisible();
    await expect(visitor.getByText(/Bitwig/)).toBeVisible();
    const link = visitor.getByRole("link", { name: /SoundCloud/ });
    await expect(link).toHaveAttribute("href", "https://soundcloud.com/mia-k");
    await expect(link).toHaveAttribute("rel", /nofollow/);
    await expect(
      visitor.locator('img[src*="/object/sign/avatars/"]').first(),
    ).toBeVisible();
    await expect(visitor.getByText("Week streak")).toBeVisible();
  });
});

test("on a wide screen, the profile is edited in a panel over it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const bio = `Garage and broken beats. ${stamp}`;
  await signInWithMagicLink(page, "mia@example.com", "/u/mia");
  await expect(async () => {
    await page.getByRole("button", { name: "Edit profile" }).click();
    await expect(page).toHaveURL(/\?edit=profile$/, { timeout: 2000 });
  }).toPass();
  const panel = page.getByRole("dialog", { name: "Edit profile" });
  await expect(panel).toBeVisible();
  await panel.getByLabel(/Bio/).fill(bio);
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/edit=profile/);
  await expect(page.getByText(bio)).toBeVisible();
});

test("leaving the panel with changes asks first", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInWithMagicLink(page, "mia@example.com", "/u/mia?edit=profile");
  const panel = page.getByRole("dialog", { name: "Edit profile" });
  await expect(panel).toBeVisible();
  const bio = panel.getByLabel(/Bio/);
  const before = await bio.inputValue();
  await bio.fill(`${before} and more`);

  // Escape asks; Keep editing is the default, so Enter keeps the change.
  await page.keyboard.press("Escape");
  const ask = page.getByRole("dialog", { name: "Discard changes?" });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(ask).toBeHidden();
  await expect(bio).toHaveValue(`${before} and more`);

  // Discard closes it, and the change is gone.
  await page.keyboard.press("Escape");
  await ask.getByRole("button", { name: "Discard" }).click();
  await expect(panel).toBeHidden();
  await page.goto("/u/mia?edit=profile");
  await expect(panel.getByLabel(/Bio/)).toHaveValue(before);
});

test("on a phone, Cancel with changes asks first", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInWithMagicLink(page, "mia@example.com", "/settings/profile");
  const name = page.getByLabel("Display name");
  await expect(async () => {
    await name.fill("Mia K, changed");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("dialog", { name: "Discard changes?" }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL(/\/u\/mia$/);
});
