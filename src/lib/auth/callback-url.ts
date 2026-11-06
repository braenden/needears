import type { LoginMethod } from "./last-login";

/**
 * Where Supabase sends people back to, then on to `next` (a path here).
 * `via` says which way they signed in, for "You signed in with Google
 * last time".
 */
export function callbackUrl(next: string, via: LoginMethod = "email"): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  if (via !== "email") url.searchParams.set("via", via);
  return url.toString();
}
