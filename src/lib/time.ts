/** 102000 -> "1:42", 3723000 -> "1:02:03". */
export function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "1:42" -> 102000. Returns null for anything that is not m:ss or h:mm:ss. */
export function parseTime(value: string) {
  const match = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (!match) return null;
  const [, h, m, s] = match;
  const seconds = Number(s);
  if (seconds > 59) return null;
  if (h !== undefined && Number(m) > 59) return null;
  return ((Number(h ?? 0) * 60 + Number(m)) * 60 + seconds) * 1000;
}

/** Spoken form for screen readers: "1 minute 42 seconds". */
export function formatTimeSpoken(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts = [];
  if (m) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  parts.push(`${s} ${s === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}

/** "1:42" for a point, "1:42 to 1:58" for a range. */
export function formatSpan(startMs: number, endMs?: number | null) {
  return endMs != null && endMs > startMs
    ? `${formatTime(startMs)} to ${formatTime(endMs)}`
    : formatTime(startMs);
}

/** Now, rounded down to the minute: what relative dates are counted from. */
export function currentMinute() {
  return Math.floor(Date.now() / 60_000) * 60_000;
}
