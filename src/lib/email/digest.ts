import { formatTime } from "@/lib/time";

export type DigestItem = {
  kind: "comment" | "reply" | "helpful";
  actor: string | null;
  track_title: string;
  track_slug: string;
  time_ms: number | null;
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

// Names and titles come from other people. Control characters and text
// direction marks could make them pose as something else.
function clean(value: string, max = 60): string {
  const plain = value
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

function line(item: DigestItem): string {
  const who = item.actor ? clean(item.actor, 50) : "Someone";
  const title = clean(item.track_title);
  const at = item.time_ms != null ? ` at ${formatTime(item.time_ms)}` : "";
  switch (item.kind) {
    case "comment":
      return `${who} commented on ${title}${at}`;
    case "reply":
      return `${who} replied to your comment on ${title}${at}`;
    case "helpful":
      return `${who} marked your comment on ${title} as Helpful`;
  }
}

function trackUrl(base: string, item: DigestItem): string {
  const t = item.time_ms != null ? `?t=${Math.floor(item.time_ms / 1000)}` : "";
  return `${base}/t/${encodeURIComponent(item.track_slug)}${t}`;
}

// One email with what happened since the last one. The subject is fixed and
// no comment text is quoted, so other people's words never reach an inbox
// as a link from us; the email points to the track instead.
export function renderDigest(items: DigestItem[], total: number, base: string) {
  const subject =
    total === 1
      ? "New feedback on Need Ears"
      : `${total} new things on Need Ears`;
  const settings = `${base}/settings`;
  const more = total - items.length;

  const text = [
    "Here is what happened on Need Ears:",
    "",
    ...items.flatMap((item) => [
      `- ${line(item)}`,
      `  ${trackUrl(base, item)}`,
    ]),
    ...(more > 0 ? [`- and ${more} more`] : []),
    "",
    `You get these emails because email notifications are on. Turn them off in your settings: ${settings}`,
  ].join("\n");

  const html = [
    "<p>Here is what happened on Need Ears:</p>",
    "<ul>",
    ...items.map(
      (item) =>
        `<li><a href="${escapeHtml(trackUrl(base, item))}">${escapeHtml(line(item))}</a></li>`,
    ),
    ...(more > 0 ? [`<li>and ${more} more</li>`] : []),
    "</ul>",
    `<p style="color:#666;font-size:12px">You get these emails because email notifications are on. <a href="${escapeHtml(settings)}">Turn them off in your settings</a>.</p>`,
  ].join("\n");

  return { subject, text, html };
}
