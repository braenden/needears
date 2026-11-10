import { expect, test } from "@playwright/test";
import { pageIn, signInWithMagicLink, testWav } from "./helpers";

// The sign-in can end while a track page is open (signed out in another
// tab). The page still looks signed in; posting then goes to sign in, and
// what was written comes back afterwards.
test("a comment after the sign-in has ended asks to sign in and keeps the text", async ({
  page,
}) => {
  const handle = `e2e_o_${Date.now().toString(36)}`;
  const email = `${handle}@example.com`;
  const text = `The hats are a bit loud after the drop ${handle}`;
  const trackPath = "/t/neon-steps-seed0009";

  await signInWithMagicLink(page, email, trackPath);
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByLabel("Username").fill(handle);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(new RegExp(`${trackPath}$`));
  await pageIn(page);

  await page.getByLabel("Comment", { exact: true }).fill(text);
  // As if signed out somewhere else.
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Comment", exact: true }).click();

  await expect(page).toHaveURL(/\/login\?next=%2Ft%2Fneon-steps-seed0009/);
  await expect(page.getByText("You've been signed out.")).toBeVisible();

  await signInWithMagicLink(page, email, trackPath);
  await expect(page).toHaveURL(new RegExp(`${trackPath}$`));
  const box = page.getByLabel("Comment", { exact: true });
  await expect(box).toHaveValue(text);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: text }).first(),
  ).toBeVisible();
});

// The same on the upload page: Publish says what happened instead of
// "something broke", and the file and the details stay. Closing or reloading
// the tab with a file chosen asks first. Nothing is published.
test("publishing after the sign-in has ended says so and keeps the track", async ({
  page,
}) => {
  await signInWithMagicLink(page, "nora@example.com", "/upload");
  await pageIn(page);
  const leaveAsks = () =>
    page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await leaveAsks()).toBe(false);

  await page.locator('input[type="file"]').setInputFiles({
    name: "Ola - Nattog v3_FINAL.wav",
    mimeType: "audio/wav",
    buffer: testWav(),
  });
  await expect(page.getByLabel("Title")).toHaveValue("Ola Nattog v3 FINAL");
  expect(await leaveAsks()).toBe(true);

  await page.getByLabel("Genre").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: /Made by me/ }).check();
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "You've been signed out." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in again" }),
  ).toHaveAttribute("target", "_blank");
  await expect(page.getByText("Ola Nattog v3 FINAL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
});
