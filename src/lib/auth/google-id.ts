// Sign in with Google through Google Identity Services: Google hands the
// page an ID token, and Supabase turns it into a session. The consent screen
// then names our own site instead of the Supabase project's address.
//
// The ID token carries a nonce so a captured token cannot be replayed:
// Google gets the SHA-256 of a fresh random value, Supabase gets the value
// itself and checks that it hashes to what the token says.

/** A fresh random nonce for one sign-in attempt. */
export function createRawNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** The SHA-256 of the nonce in hex, which is what Google puts in the token. */
export async function hashNonce(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Where to go once signed in, like /auth/callback: first time in, people
 * pick a handle at /welcome before going on.
 */
export function destinationAfterSignIn(
  user: { user_metadata?: Record<string, unknown> } | null,
  next: string,
): string {
  if (user?.user_metadata?.onboarded === true) return next;
  return `/welcome?${new URLSearchParams({ next })}`;
}

type SignInWithIdToken = (credentials: {
  provider: "google";
  token: string;
  nonce: string;
}) => Promise<{
  data: { user: { user_metadata?: Record<string, unknown> } | null };
  error: unknown;
}>;

/** Turns Google's ID token into a session. The destination, or null on failure. */
export async function completeGoogleSignIn({
  credential,
  rawNonce,
  next,
  signInWithIdToken,
}: {
  credential: string;
  rawNonce: string;
  next: string;
  signInWithIdToken: SignInWithIdToken;
}): Promise<string | null> {
  const { data, error } = await signInWithIdToken({
    provider: "google",
    token: credential,
    nonce: rawNonce,
  });
  if (error || !data.user) return null;
  return destinationAfterSignIn(data.user, next);
}
