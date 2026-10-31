import "server-only";
import { isIP } from "node:net";

// The client IP as seen by Vercel, or null when there is none (local dev).
export function clientIp(request: Request): string | null {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim();
  return ip && isIP(ip) ? ip : null;
}
