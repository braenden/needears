const NAME = "NEXT_PUBLIC_GOOGLE_CLIENT_ID";

/**
 * The Google OAuth client ID, or null when Google sign-in is not set up.
 * Read on the server when a request comes in, not inlined at build time,
 * so one build works with or without it; the CSP and the login page use
 * the same answer.
 */
export function googleClientId(): string | null {
  return process.env[NAME]?.trim() || null;
}
