// Helpers for Google: a nonce for the code popup that connects Google in
// Settings, and where to go once signed in.

/** A fresh random nonce for one sign-in attempt. */
export function createRawNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
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
