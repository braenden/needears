import { formatTime } from "@/lib/time";

export type DigestItem = {
  kind: "comment" | "reply" | "helpful";
  actor: string | null;
  track_title: string;
  track_slug: string;
  time_ms: number | null;
  excerpt: string | null;
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

function line(item: DigestItem): string {
  const who = item.actor ?? "Someone";
  const at = item.time_ms != null ? ` at ${formatTime(item.time_ms)}` : "";
  switch (item.kind) {
    case "comment":
      return `${who} commented on ${item.track_title}${at}`;
    case "reply":
      return `${who} replied to your comment on ${item.track_title}${at}`;
    case "helpful":
      return `${who} marked your comment on ${item.track_title} as Helpful`;
  }
}

function trackUrl(base: string, item: DigestItem): string {
  const t = item.time_ms != null ? `?t=${Math.floor(item.time_ms / 1000)}` : "";
  return `${base}/t/${encodeURIComponent(item.track_slug)}${t}`;
}

// One email with everything that happened since the last one. Names, titles
// and comment text come from other people, so the HTML escapes them.
export function renderDigest(items: DigestItem[], base: string) {
  const count = items.length;
  const subject =
    count === 1
      ? line(items[0]!)
      : `${count} new things on your tracks and comments`;
  const settings = `${base}/settings`;

  const text = [
    "Here is what happened on Need Ears:",
    "",
    ...items.flatMap((item) => [
      `- ${line(item)}`,
      ...(item.excerpt ? [`  "${item.excerpt}"`] : []),
      `  ${trackUrl(base, item)}`,
    ]),
    "",
    `You get these emails because email notifications are on. Turn them off in your settings: ${settings}`,
  ].join("\n");

  const html = [
    "<p>Here is what happened on Need Ears:</p>",
    "<ul>",
    ...items.map(
      (item) =>
        `<li><a href="${escapeHtml(trackUrl(base, item))}">${escapeHtml(line(item))}</a>` +
        (item.excerpt ? `<br><q>${escapeHtml(item.excerpt)}</q>` : "") +
        "</li>",
    ),
    "</ul>",
    `<p style="color:#666;font-size:12px">You get these emails because email notifications are on. <a href="${escapeHtml(settings)}">Turn them off in your settings</a>.</p>`,
  ].join("\n");

  return { subject: subject.slice(0, 150), text, html };
}
