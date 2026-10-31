// How someone signed in last time, kept in this browser only, so the login
// page can point at it. Nothing is sent anywhere. Storage can be off or
// full (private windows); then nothing is remembered and nothing is shown.

export type LoginMethod = "google" | "email";

const KEY = "needears:last-login";

export function saveLastLogin(method: LoginMethod): void {
  try {
    localStorage.setItem(KEY, method);
  } catch {
    // Not remembered; the login page then shows no hint.
  }
}

export function readLastLogin(): LoginMethod | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "google" || value === "email" ? value : null;
  } catch {
    return null;
  }
}

// /auth/callback runs on the server, so after a magic link it adds this to
// the address it sends people on to, and the page saves it and removes it.
export const SIGNED_IN_HASH = "#signed-in=email";
