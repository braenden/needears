import { expect, test } from "@playwright/test";
import { GOOGLE_URL } from "../playwright.config";
import { magicLinkFor } from "./helpers";

// Sign in with Google: Supabase sends the browser to Google and back to
// /auth/callback (PKCE). Google itself cannot answer in CI, so these check
// what is asked of Supabase, and how the page remembers the way in.

test("without a client ID, only the email link is offered", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Continue with email" }),
  ).toBeVisible();
  await expect(page.getByTestId("google-button")).toHaveCount(0);
  await expect(page.getByText("or", { exact: true })).toHaveCount(0);
});

test("Continue with Google goes to Google through Supabase, and back", async ({
  page,
}) => {
  let asked: URL | null = null;
  await page.route("**/auth/v1/authorize**", (route) => {
    asked = new URL(route.request().url());
    return route.fulfill({ contentType: "text/html", body: "<p>Google</p>" });
  });
  await page.goto(`${GOOGLE_URL}/login?next=%2Fupload`);
  const google = page.getByRole("button", { name: "Continue with Google" });
  await expect(google).toBeEnabled();
  await google.click();
  await expect.poll(() => asked).not.toBeNull();
  const url = asked as unknown as URL;
  expect(url.searchParams.get("provider")).toBe("google");
  // PKCE: a challenge goes out, the verifier stays in this browser.
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(url.searchParams.get("code_challenge_method")).toMatch(/s256/i);
  const back = new URL(url.searchParams.get("redirect_to")!);
  expect(back.origin + back.pathname).toBe(`${GOOGLE_URL}/auth/callback`);
  expect(back.searchParams.get("next")).toBe("/upload");
  expect(back.searchParams.get("via")).toBe("google");
  // Nothing is remembered before the sign-in has worked.
  expect(
    await page.evaluate(() => localStorage.getItem("needears:last-login")),
  ).toBeNull();
});

test("a sign-in that worked is remembered as Google or email", async ({
  page,
}) => {
  // What /auth/callback adds once Google's sign-in has worked.
  await page.goto(`${GOOGLE_URL}/feed#signed-in=google`);
  await expect(page).toHaveURL(`${GOOGLE_URL}/feed`);
  await page.goto(`${GOOGLE_URL}/login`);
  await expect(
    page.getByText("You signed in with Google last time."),
  ).toBeVisible();
});

test("after a magic link, the login page marks email as last used", async ({
  page,
}) => {
  // Signs in on the server with Google set up, so the hint can show there
  // (the browser keeps it per origin).
  const sentAfter = Date.now() - 1_000;
  await page.goto(`${GOOGLE_URL}/login?next=%2Ffeed`);
  await expect(page.getByText(/last time/)).toHaveCount(0);
  await page.getByLabel("Email", { exact: true }).fill("jonas@example.com");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.getByText("Check your email.")).toBeVisible();
  await page.goto(await magicLinkFor("jonas@example.com", sentAfter));
  await expect(page).toHaveURL(`${GOOGLE_URL}/feed`);

  // Signed in already, so ask to sign in again to see the form.
  await page.goto(`${GOOGLE_URL}/login?reauth=1`);
  await expect(
    page.getByText("You signed in with email last time."),
  ).toBeVisible();
});

test("Google's popup keeps its opener, so it can hand back the token", async ({
  page,
  context,
}) => {
  await context.route("https://accounts.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>popup</p>" }),
  );
  await page.goto(`${GOOGLE_URL}/login`);
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.evaluate(() => {
      window.open("https://accounts.google.com/gsi/select", "g", "popup");
    }),
  ]);
  await popup.waitForLoadState();
  expect(await popup.evaluate(() => window.opener !== null)).toBe(true);
});
