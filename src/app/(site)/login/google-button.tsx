"use client";

import { useRef, useState } from "react";
import Script from "next/script";

import { Button } from "@/components/ui/button";
import {
  completeGoogleSignIn,
  createRawNonce,
  hashNonce,
} from "@/lib/auth/google-id";
import { browserClient } from "@/lib/supabase/lazy";

export const GSI_SCRIPT = "https://accounts.google.com/gsi/client";

// The parts of Google Identity Services this page uses.
type GoogleId = {
  initialize: (config: {
    client_id: string;
    nonce: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: "popup";
    context?: "signin";
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline" | "filled_black";
      size: "large";
      text: "continue_with";
      shape: "rectangular";
      logo_alignment: "center";
      width: number;
      locale: string;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/**
 * Google's own "Continue with Google" button. The script loads with the
 * page's CSP nonce; until it has drawn the button, a look-alike of the same
 * size holds the place so nothing moves.
 */
export function GoogleButton({
  clientId,
  next,
  scriptNonce,
  disabled = false,
  onError,
}: {
  clientId: string;
  next: string;
  scriptNonce?: string;
  disabled?: boolean;
  onError: (message: string | null) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const nonce = useRef<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  async function draw() {
    const id = window.google?.accounts.id;
    const parent = mount.current;
    if (!id || !parent) return;
    // A new nonce for every attempt, also after a failed one.
    const raw = createRawNonce();
    nonce.current = raw;
    id.initialize({
      client_id: clientId,
      nonce: await hashNonce(raw),
      ux_mode: "popup",
      context: "signin",
      callback: (response) => {
        if (response.credential) void finish(response.credential);
      },
    });
    const light = document.documentElement.classList.contains("light");
    id.renderButton(parent, {
      type: "standard",
      theme: light ? "outline" : "filled_black",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "center",
      width: Math.round(Math.min(400, Math.max(200, parent.offsetWidth))),
      // The site is in English; Google would follow the browser's language.
      locale: "en",
    });
    setDrawn(true);
  }

  async function finish(credential: string) {
    const rawNonce = nonce.current;
    if (!rawNonce) return;
    onError(null);
    setSigningIn(true);
    const supabase = await browserClient();
    const destination = await completeGoogleSignIn({
      credential,
      rawNonce,
      next,
      signInWithIdToken: (credentials) =>
        supabase.auth.signInWithIdToken(credentials),
    }).catch(() => null);
    if (destination) {
      // A full load, so the server sees the new session cookie.
      window.location.assign(destination);
      return;
    }
    setSigningIn(false);
    onError("Google sign-in didn't work. Try again, or use the email link.");
    void draw();
  }

  return (
    <div className="relative h-11" aria-busy={signingIn || undefined}>
      <Script
        src={GSI_SCRIPT}
        nonce={scriptNonce}
        strategy="afterInteractive"
        onReady={() => void draw()}
        onError={() =>
          onError(
            "Google sign-in isn't available right now. Try the email link.",
          )
        }
      />
      {!drawn || signingIn || disabled ? (
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled
          className="absolute inset-0 z-10 h-11 w-full"
        >
          <GoogleGlyph />
          {signingIn ? "Signing in…" : "Continue with Google"}
        </Button>
      ) : null}
      <div
        ref={mount}
        data-testid="google-button"
        className="flex h-11 w-full items-center justify-center"
      />
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}
