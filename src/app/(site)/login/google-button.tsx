"use client";

import { GoogleIdButton } from "@/components/auth/google-id-button";
import { completeGoogleSignIn } from "@/lib/auth/google-id";
import { saveLastLogin } from "@/lib/auth/last-login";
import { browserClient } from "@/lib/supabase/lazy";

/** Signing in with Google's button: the ID token becomes a session. */
export function GoogleButton({
  clientId,
  next,
  scriptNonce,
  disabled = false,
  onBusy,
  onError,
}: {
  clientId: string;
  next: string;
  scriptNonce?: string;
  disabled?: boolean;
  /** True while the token is turned into a session. */
  onBusy?: (busy: boolean) => void;
  onError: (message: string | null) => void;
}) {
  return (
    <GoogleIdButton
      clientId={clientId}
      scriptNonce={scriptNonce}
      disabled={disabled}
      onBusy={onBusy}
      onUnavailable={() =>
        onError("Google sign-in isn't available right now. Try the email link.")
      }
      onCredential={async (credential, rawNonce) => {
        onError(null);
        const supabase = await browserClient();
        const destination = await completeGoogleSignIn({
          credential,
          rawNonce,
          next,
          signInWithIdToken: (credentials) =>
            supabase.auth.signInWithIdToken(credentials),
        }).catch(() => null);
        if (!destination) {
          onError(
            "Google sign-in didn't work. Try again, or use the email link.",
          );
          return false;
        }
        saveLastLogin("google");
        // A full load, so the server sees the new session cookie.
        window.location.assign(destination);
        return true;
      }}
    />
  );
}
