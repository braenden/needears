// Records the README GIF (docs/media/track-page.gif) from a local run:
// a signed in listener plays a seed track, pauses, leaves a comment at that
// second and the marker appears on the waveform.
//
// Needs `supabase start` (with the seed), `pnpm build && pnpm start` on
// port 3000 and ffmpeg. Run with `pnpm readme:gif`. It posts a real comment
// to the local database; `pnpm db:reset` removes it.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const MAILPIT = "http://127.0.0.1:54424";
const TRACK = "/t/brygge-beat-seed0004";
const OUT = path.resolve("docs/media/track-page.gif");
const size = { width: 1000, height: 940 };

async function magicLink(email, after) {
  for (let i = 0; i < 40; i++) {
    const query = encodeURIComponent(`to:"${email}"`);
    const { messages } = await (
      await fetch(`${MAILPIT}/api/v1/search?query=${query}`)
    ).json();
    const message = messages.find((m) => Date.parse(m.Created) >= after);
    if (message) {
      const { HTML, Text } = await (
        await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)
      ).json();
      const match = `${HTML}\n${Text}`.match(
        /https?:\/\/[^\s"'<>]+\/verify\?[^\s"'<>]+/,
      );
      if (match) return match[0].replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No sign-in email to ${email}`);
}

const browser = await chromium.launch();

// Sign in first, outside the recording.
const auth = await browser.newContext({ colorScheme: "dark" });
const login = await auth.newPage();
const sentAfter = Date.now() - 1000;
await login.goto(`${BASE}/login?next=${encodeURIComponent(TRACK)}`);
await login.getByLabel("Email", { exact: true }).fill("nora@example.com");
await login.getByRole("button", { name: "Email me a sign-in link" }).click();
await login.getByText("Check your email.").waitFor();
await login.goto(await magicLink("nora@example.com", sentAfter));
await login.waitForURL(`${BASE}${TRACK}`);
const storageState = await auth.storageState();
await auth.close();

const videoDir = mkdtempSync(path.join(tmpdir(), "needears-gif-"));
const context = await browser.newContext({
  colorScheme: "dark",
  viewport: size,
  deviceScaleFactor: 1,
  storageState,
  recordVideo: { dir: videoDir, size },
});
const page = await context.newPage();
await page.goto(`${BASE}${TRACK}`);
await page.getByRole("group", { name: "Comment markers" }).waitFor();
await page.waitForTimeout(1200);

// Preview an existing comment.
await page.getByRole("button", { name: /at 0:09$/ }).hover();
await page.waitForTimeout(1600);
await page.mouse.move(10, 10);

// Listen, then stop at the moment to comment on.
await page.getByRole("button", { name: "Play" }).click();
await page.waitForTimeout(4300);
await page.getByRole("button", { name: "Pause" }).click();
await page.waitForTimeout(500);

const box = page.getByLabel("Comment", { exact: true });
await page.getByText("Mix", { exact: true }).first().click();
await box.pressSequentially("Snare gets buried under the pad here.", {
  delay: 35,
});
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Comment", exact: true }).click();
await page.waitForTimeout(3000);

await context.close();
await browser.close();

const [video] = readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
mkdirSync(path.dirname(OUT), { recursive: true });
// Skip the blank first frames, then a two pass palette for a small GIF.
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    "0.9",
    "-i",
    path.join(videoDir, video),
    "-vf",
    "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    OUT,
  ],
  { stdio: "inherit" },
);
rmSync(videoDir, { recursive: true, force: true });
console.log(`Wrote ${OUT}`);
