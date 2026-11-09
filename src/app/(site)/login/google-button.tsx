"use client";

import { useState } from "react";
import Script from "next/script";
import { Loader2Icon } from "lucide-react";

import {
  GSI_SCRIPT,
  type GoogleCodeResponse,
  POPUP_BLOCKED,
} from "@/components/auth/google-code-client";
import { createRawNonce, destinationAfterSignIn } from "@/lib/auth/google-id";
import { saveLastLogin } from "@/lib/auth/last-login";
import { browserClient } from "@/lib/supabase/lazy";
import { cn } from "@/lib/utils";

export const GOOGLE_UNAVAILABLE =
  "Google sign-in isn't available right now. Try the email link.";
export const GOOGLE_FAILED =
  "Google sign-in didn't work. Try again, or use the email link.";

/** Google's G, in its own colours. */
function GoogleG() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-[18px] shrink-0"
      aria-hidden="true"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * "Continue with Google": Google's account chooser opens in a popup (its
 * code client), so Google names our own site. Our server swaps the code it
 * hands back for Google's ID token, and the page signs in with that at
 * Supabase. The same surface as the email field below it.
 */
export function GoogleButton({
  clientId,
  next,
  scriptNonce,
  disabled = false,
  chooseAccount = false,
  onError,
}: {
  clientId: string;
  next: string;
  scriptNonce?: string;
  disabled?: boolean;
  /**
   * Signing in again: Google asks which account, so proving it again is
   * a choice, not one click on whatever account the browser is in.
   */
  chooseAccount?: boolean;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  // The popup has to open in the click itself, or the browser blocks it.
  function start() {
    onError(null);
    const oauth2 = window.google?.accounts.oauth2;
    if (!oauth2) {
      onError(GOOGLE_UNAVAILABLE);
      return;
    }
    const state = createRawNonce();
    oauth2
      .initCodeClient({
        client_id: clientId,
        scope: "openid email profile",
        ux_mode: "popup",
        select_account: chooseAccount,
        state,
        callback: (response: GoogleCodeResponse) => {
          // Cancelled in Google's window: a change of mind, not an error.
          if (response.error === "access_denied") return;
          if (!response.code || response.state !== state) {
            onError(GOOGLE_FAILED);
            return;
          }
          void finish(response.code);
        },
        error_callback: (error) => {
          // Closing the window is a change of mind too.
          if (error.type === "popup_failed_to_open") onError(POPUP_BLOCKED);
        },
      })
      .requestCode();
  }

  async function finish(code: string) {
    setBusy(true);
    const destination = await signIn(code, next).catch(() => null);
    if (!destination) {
      setBusy(false);
      onError(GOOGLE_FAILED);
      return;
    }
    // Only now, with the session made.
    saveLastLogin("google");
    // A full load, so the server sees the new session cookie.
    window.location.assign(destination);
  }

  return (
    <>
      <Script
        src={GSI_SCRIPT}
        nonce={scriptNonce}
        strategy="afterInteractive"
      />
      <button
        type="button"
        data-testid="google-button"
        disabled={disabled || busy}
        onClick={start}
        className={cn(
          "flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border bg-card text-[15px] font-medium text-foreground focus-ring transition-colors duration-fast outline-none hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {busy ? (
          <Loader2Icon
            className="size-[18px] animate-spin"
            aria-hidden="true"
          />
        ) : (
          <GoogleG />
        )}
        Continue with Google
      </button>
    </>
  );
}

/**
 * Swaps Google's code for its ID token on our server, signs in with it and
 * says where to go: /welcome first for a new account. Null when it failed.
 */
async function signIn(code: string, next: string): Promise<string | null> {
  const response = await fetch("/api/auth/google-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    idToken?: unknown;
  } | null;
  if (typeof body?.idToken !== "string") return null;
  const { data, error } = await (
    await browserClient()
  ).auth.signInWithIdToken({ provider: "google", token: body.idToken });
  if (error || !data.user) return null;
  return destinationAfterSignIn(data.user, next);
}
