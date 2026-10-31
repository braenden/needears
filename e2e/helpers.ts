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
