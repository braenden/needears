// Content Security Policy for pages (issue 003).
//
// Scripts need the per request nonce (Next.js adds it to its own scripts
// and next-themes gets it as a prop); 'strict-dynamic' lets those scripts
// load the chunks they import. Styles allow inline because Radix, sonner
// and wavesurfer.js set style attributes and inject <style> tags, which a
// nonce cannot cover; the risk from injected CSS is small next to scripts.
//
// Audio and peaks come from Supabase Storage through signed URLs, so the
// Supabase origin is allowed for fetch and media. Images are limited to
// our own origin, Supabase and Google avatars, so an avatar URL on any
// other host does not load (a mitigation for issue 007).
//
// When Sentry is on, its ingest origin is allowed for fetch so the browser
// SDK can send errors (src/lib/monitoring/sentry.ts).

export const GOOGLE_AVATAR_ORIGIN = "https://lh3.googleusercontent.com";

export function buildCsp({
  nonce,
  supabaseOrigin,
  isDev,
  upgradeInsecure,
  sentryOrigin = null,
}: {
  nonce: string;
  supabaseOrigin: string;
  isDev: boolean;
  upgradeInsecure: boolean;
  sentryOrigin?: string | null;
}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // React uses eval for better stack traces in development only.
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      supabaseOrigin,
      GOOGLE_AVATAR_ORIGIN,
    ],
    "font-src": ["'self'"],
    "media-src": ["'self'", "blob:", supabaseOrigin],
    "connect-src": [
      "'self'",
      supabaseOrigin,
      ...(sentryOrigin ? [sentryOrigin] : []),
      // Hot reload in development.
      ...(isDev ? ["ws:"] : []),
    ],
    // The mp3 encoder runs in a module worker from our own origin.
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(
    ([name, values]) => `${name} ${values.join(" ")}`,
  );
  if (upgradeInsecure) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

// 128 random bits, base64. A fresh one for every request.
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
