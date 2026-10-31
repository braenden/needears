import { timingSafeEqual } from "node:crypto";

// Cron routes are called with `Authorization: Bearer $CRON_SECRET` (Vercel
// Cron and the scheduled GitHub workflow). Without the secret nothing runs.
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
