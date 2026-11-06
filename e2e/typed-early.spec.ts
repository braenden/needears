import { expect, test } from "@playwright/test";

// On a slow phone people type before the page has loaded. What they typed
// is what gets sent.
test("an email typed before the page has loaded is the one sent", async ({
  page,
}) => {
  // The login form's own script comes late: the page shows, the form
  // does not work yet.
  await page.route("**/_next/static/chunks/**", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes("Email me a sign-in link"))
      await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.fulfill({ response, body });
  });
  const email = `e2e_early_${Date.now().toString(36)}@example.com`;
  await page.goto("/login", { waitUntil: "commit" });
  const field = page.getByLabel("Email", { exact: true });
  await field.fill(email);
  // Typed before React took over the field.
  expect(
    await field.evaluate((el) =>
      Object.keys(el).some((key) => key.startsWith("__reactProps")),
    ),
  ).toBe(false);
  const send = page.getByRole("button", { name: "Email me a sign-in link" });
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await expect(field).toHaveValue(email);
  await send.click();
  await expect(page.getByText(`We sent a link to ${email}.`)).toBeVisible();
});
