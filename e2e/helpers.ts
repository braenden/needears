import { expect, type Page } from "@playwright/test";

// Mailpit is the local Supabase mail catcher (port 54424, see supabase/config.toml).
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54424";

type MailpitSummary = { ID: string; Created: string };

async function latestMessageTo(email: string, after: number) {
  const query = encodeURIComponent(`to:"${email}"`);
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  const { messages } = (await res.json()) as { messages: MailpitSummary[] };
  return messages.find((m) => Date.parse(m.Created) >= after) ?? null;
}

/** Waits for the newest sign-in email to `email` and returns its link. */
export async function magicLinkFor(email: string, after: number) {
  let id: string | null = null;
  await expect
    .poll(
      async () => {
        id = (await latestMessageTo(email, after))?.ID ?? null;
        return id;
      },
      { message: `sign-in email to ${email}`, timeout: 20_000 },
    )
    .not.toBeNull();
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  const { HTML, Text } = (await res.json()) as { HTML: string; Text: string };
  const match = `${HTML}\n${Text}`.match(
    /https?:\/\/[^\s"'<>]+\/verify\?[^\s"'<>]+/,
  );
  if (!match) throw new Error(`No sign-in link in the email to ${email}`);
  return match[0].replaceAll("&amp;", "&");
}

/** Signs in through the real /login form and the emailed magic link. */
export async function signInWithMagicLink(
  page: Page,
  email: string,
  next: string,
) {
  // Mailpit stores whole seconds, so allow for the rounding.
  const sentAfter = Date.now() - 1_000;
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email.")).toBeVisible();
  await page.goto(await magicLinkFor(email, sentAfter));
  await pageIn(page);
}

/**
 * Waits until the page has fully arrived: the loading skeleton is gone and
 * the streamed page has replaced it. Until then the page can briefly hold
 * the streamed copy too, hidden, which trips up strict locators.
 */
export async function pageIn(page: Page) {
  await page.waitForFunction(
    () =>
      !document.querySelector('[hidden][id^="S:"]') &&
      !document.querySelector('main [role="status"][aria-label="Loading"]') &&
      !document.querySelector('main [role="status"][aria-label="Searching"]'),
  );
}

/** Opens the track's "More" menu and picks an item, once the page is ready. */
export async function trackMenu(page: Page, item: string) {
  await expect(async () => {
    await page.getByRole("button", { name: "More for this track" }).click();
    await page.getByRole("menuitem", { name: item }).click({ timeout: 2000 });
  }).toPass();
}

/**
 * A mono 16 bit wav: a 220 Hz tone that swells every second, so the waveform
 * has some shape. 8 seconds is about 700 KB.
 */
export function testWav(seconds = 8, sampleRate = 44_100) {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const envelope = 0.25 + 0.6 * Math.abs(Math.sin(Math.PI * t));
    const value = envelope * Math.sin(2 * Math.PI * 220 * t);
    buffer.writeInt16LE(Math.round(value * 32_000), 44 + i * 2);
  }
  return buffer;
}

/**
 * Records the largest single change of any audio element's volume while it
 * plays (changes while paused cannot be heard). A fade moves in small
 * steps; a cut jumps from 1 to 0. Call before the page loads.
 */
export async function watchVolumeSteps(page: Page) {
  await page.addInitScript(() => {
    const volume = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "volume",
    )!;
    const w = window as unknown as { __jump: number };
    w.__jump = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "volume", {
      configurable: true,
      get() {
        return volume.get!.call(this);
      },
      set(value: number) {
        const before = volume.get!.call(this) as number;
        volume.set!.call(this, value);
        if (!(this as HTMLMediaElement).paused)
          w.__jump = Math.max(w.__jump, Math.abs(value - before));
      },
    });
  });
}

/** The largest volume step while `action` plays out (see watchVolumeSteps). */
export async function largestStep(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    (window as unknown as { __jump: number }).__jump = 0;
  });
  await action();
  await page.waitForTimeout(800);
  return page.evaluate(() => (window as unknown as { __jump: number }).__jump);
}
