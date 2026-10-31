/** Where Supabase sends people back to, then on to `next` (a path here). */
export function callbackUrl(next: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}
