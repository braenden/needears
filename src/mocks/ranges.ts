import type { MarkerFormat } from "@/components/track/export-markers-menu";
import { displayNameOf } from "@/components/common/user-avatar";
import { formatTime } from "@/lib/time";
import type { RangeComment } from "@/types/view";

import { comments } from "./comments";

/** The Night Bus comments, two of them about a stretch rather than a second. */
export const rangeComments: RangeComment[] = comments.map((c) =>
  c.id === "c3"
    ? { ...c, end_ms: 96_000 }
    : c.id === "c6"
      ? { ...c, end_ms: 188_000 }
      : c,
);

export const referenceUrl =
  "https://soundcloud.com/example-artist/late-night-reference";

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
const reaperTime = (ms: number) => {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = (total % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
};

/**
 * What GET /api/tracks/[id]/markers returns, built in the browser so the
 * export menu on /design downloads something real.
 */
export function mockMarkersHref(_trackId: string, format: MarkerFormat) {
  const timed = rangeComments.filter((c) => c.time_ms !== null);
  let text: string;
  if (format === "csv") {
    text = [
      "time,end,author,category,comment",
      ...timed.map((c) =>
        [
          formatTime(c.time_ms!),
          c.end_ms ? formatTime(c.end_ms) : "",
          displayNameOf(c.author),
          c.category,
          c.body,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n");
  } else if (format === "txt") {
    text = timed
      .map(
        (c) =>
          `${formatTime(c.time_ms!)}${c.end_ms ? ` to ${formatTime(c.end_ms)}` : ""}  ${displayNameOf(c.author)}: ${c.body}`,
      )
      .join("\n");
  } else {
    text = [
      "#,Name,Start,End,Length",
      ...timed.map((c, i) => {
        const end = c.end_ms ?? null;
        return [
          end ? `R${i + 1}` : `M${i + 1}`,
          csvCell(`${displayNameOf(c.author)}: ${c.body}`),
          reaperTime(c.time_ms!),
          end ? reaperTime(end) : "",
          end ? reaperTime(end - c.time_ms!) : "",
        ].join(",");
      }),
    ].join("\n");
  }
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}
