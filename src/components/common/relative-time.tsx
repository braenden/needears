"use client";

import { useNow } from "@/hooks/use-now";

const absolute = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

function formatRelative(date: Date, now: number) {
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}

/** "2 days ago" on the client, a fixed date on the server. */
export function RelativeTime({
  date,
  className,
}: {
  date: string;
  className?: string;
}) {
  const now = useNow();
  const d = new Date(date);
  return (
    <time dateTime={date} title={absolute.format(d)} className={className}>
      {now === null ? absolute.format(d) : formatRelative(d, now)}
    </time>
  );
}
