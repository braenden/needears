import { expect, test } from "@playwright/test";
import { pageIn, signInWithMagicLink, testWav } from "./helpers";

// Before publishing: the level from the last track is already picked, the
// file can be played and swapped for another, and tags stop at five. Nothing
// is published, so the feeds stay as they are.
test("listen, swap the file and fill in the details", async ({ page }) => {
  await signInWithMagicLink(page, "nora@example.com", "/upload");
  await pageIn(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "first-mix.wav",
    mimeType: "audio/wav",
    buffer: testWav(),
  });
  await expect(page.getByLabel("Title")).toHaveValue("first mix");
  // Nora's tracks say she is new to this.
  await expect(
    page.getByRole("radio", { name: "I'm new to this" }),
  ).toBeChecked();

  await page.getByRole("button", { name: "Play your file" }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  await page.getByLabel("Genre").selectOption({ index: 1 });
  const tags = page.getByLabel("Tags");
  await tags.fill("lo-fi, tape, night, rain, slow, one too many");
  await expect(tags).toHaveValue("lo-fi, tape, night, rain, slow");
  await expect(
    page.getByText("That's 5 tags, the most a track can have."),
  ).toBeVisible();
  // Typed one key at a time, the words after a refused comma stay out too.
  await tags.fill("");
  await tags.pressSequentially("one, two, three, four, five, six, seven");
  await expect(tags).toHaveValue("one, two, three, four, five");
  await expect(
    page.getByText("That's 5 tags, the most a track can have."),
  ).toBeVisible();

  await page.getByLabel("Choose another file").setInputFiles({
    name: "second-mix.wav",
    mimeType: "audio/wav",
    buffer: testWav(5),
  });
  await expect(page.getByText("second-mix.wav")).toBeVisible();
  // The title was only the old file's name, so it follows; the rest stays.
  await expect(page.getByLabel("Title")).toHaveValue("second mix");
  await expect(page.getByLabel("Genre")).not.toHaveValue("");
  await expect(tags).toHaveValue("one, two, three, four, five");
  await expect(page.getByText("0:05", { exact: true })).toBeVisible();
});
