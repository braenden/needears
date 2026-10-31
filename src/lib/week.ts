// The weekly list runs Monday to Sunday, Oslo time (like the database's
// private.oslo_week_start).
const ZONE = "Europe/Oslo";

// Oslo's offset from UTC at a moment, in milliseconds (+1 or +2 hours).
function osloOffset(at: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wall - Math.floor(at / 1000) * 1000;
}

/** When the weekly list starts over: the next Monday 00:00 in Oslo, as ISO. */
export function nextWeekStart(now: number = Date.now()): string {
  const local = new Date(now + osloOffset(now));
  // getUTC* on the shifted time reads Oslo's wall clock. Monday is 1.
  const weekday = local.getUTCDay() || 7;
  const midnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + (8 - weekday),
  );
  // Midnight on the wall clock, back to UTC with that day's offset.
  return new Date(midnight - osloOffset(midnight)).toISOString();
}
