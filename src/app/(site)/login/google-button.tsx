"use client";

import { GoogleIdButton } from "@/components/auth/google-id-button";
import { Badge } from "@/components/ui/badge";
import { completeGoogleSignIn } from "@/lib/auth/google-id";
import { saveLastLogin } from "@/lib/auth/last-login";
import { browserClient } from "@/lib/supabase/lazy";

/** Signing in with Google's button: the ID token becomes a session. */
export function GoogleButton({
  clientId,
  next,
  scriptNonce,
  disabled = false,
  lastUsed = false,
  onError,
}: {
  clientId: string;
  next: string;
  scriptNonce?: string;
  disabled?: boolean;
  /** Show "Last used" on the edge: we cannot draw inside Google's button. */
  lastUsed?: boolean;
  onError: (message: string | null) => void;
}) {
  return (
    <GoogleIdButton
      clientId={clientId}
      scriptNonce={scriptNonce}
      disabled={disabled}
      busyLabel="Signing in…"
      badge={
        lastUsed ? (
          <Badge
            variant="secondary"
            className="absolute -top-2.5 right-3 z-20 h-5 px-2 text-[11px] shadow-pop"
          >
            Last used
          </Badge>
        ) : null
      }
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
