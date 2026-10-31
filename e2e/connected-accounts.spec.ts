import { expect, test } from "@playwright/test";
import { signInWithMagicLink } from "./helpers";

// Connected accounts in Settings, for someone who signs in with the email
// link. Google's own pages cannot run in CI, so the way back from them is
// what is tested: the callback with a success or an error.
test("connected accounts in Settings", async ({ page }) => {
  await signInWithMagicLink(page, "jonas@example.com", "/settings");
  const card = page.getByRole("region", { name: "Connected accounts" });

  await test.step("shows the email link and offers Google", async () => {
    await expect(card.getByText("jonas@example.com")).toBeVisible();
    await expect(card.getByText("Not connected")).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Connect Google" }),
    ).toBeEnabled();
  });

  await test.step("back from Google, it says connected once", async () => {
    await page.goto("/settings?linked=google");
    await expect(page.getByText("Google connected.")).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
  });

  await test.step("a Google account that is taken is explained", async () => {
    await page.goto(
      `/auth/callback?next=${encodeURIComponent("/settings?linked=google")}&error=server_error&error_code=identity_already_exists`,
    );
    await expect(
      page.getByText("That Google account already belongs to another profile."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
  });
});
