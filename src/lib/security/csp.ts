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
//
// When Google sign-in is set up, Google Identity Services gets the paths it
// needs on accounts.google.com: its script (loaded with our nonce; the
// source is listed for browsers without 'strict-dynamic'), its stylesheet,
// the button frame and its status calls. On every page, because the CSP
// of the first page loaded stays in force when someone navigates to /login
// without a full load. Connecting Google in Settings uses the same script:
// its account chooser is a popup window, which the CSP does not govern, and
// the code it returns is swapped on our server, not in the browser.

export const GOOGLE_AVATAR_ORIGIN = "https://lh3.googleusercontent.com";
const GSI = "https://accounts.google.com/gsi/";

export function buildCsp({
  nonce,
  supabaseOrigin,
  isDev,
  upgradeInsecure,
  sentryOrigin = null,
  googleSignIn = false,
}: {
  nonce: string;
  supabaseOrigin: string;
  isDev: boolean;
  upgradeInsecure: boolean;
  sentryOrigin?: string | null;
  googleSignIn?: boolean;
}): string {
  const gsi = (path: string) => (googleSignIn ? [`${GSI}${path}`] : []);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // React uses eval for better stack traces in development only.
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...gsi("client"),
    ],
    "style-src": ["'self'", "'unsafe-inline'", ...gsi("style")],
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
      ...gsi(""),
      // Hot reload in development.
      ...(isDev ? ["ws:"] : []),
    ],
    // The mp3 encoder runs in a module worker from our own origin.
    "worker-src": ["'self'", "blob:"],
    ...(googleSignIn ? { "frame-src": ["'self'", ...gsi("")] } : {}),
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
