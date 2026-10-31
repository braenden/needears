"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createRawNonce, hashNonce } from "@/lib/auth/google-id";

const GSI_SCRIPT = "https://accounts.google.com/gsi/client";

// The parts of Google Identity Services we use.
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
      logo_alignment: "left";
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

// Google draws its button between 200 and 400 pixels wide.
const widthFor = (parent: HTMLElement) =>
  Math.round(Math.min(400, Math.max(200, parent.clientWidth)));

/**
 * Resolves once the container has its final width: fonts loaded, two frames
 * laid out, and not hidden (after a client-side navigation the new page can
 * be in the document before it is shown, at zero width). Google keeps the
 * width it is given the first time, so it must not measure too early.
 */
async function laidOut(parent: HTMLElement, signal: AbortSignal) {
  await document.fonts?.ready;
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  if (parent.clientWidth > 0 || typeof ResizeObserver === "undefined") return;
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      wait.disconnect();
      resolve();
    };
    const wait = new ResizeObserver(() => {
      if (parent.clientWidth > 0) done();
    });
    wait.observe(parent);
    // Unmounted while still hidden: stop watching.
    signal.addEventListener("abort", done, { once: true });
  });
}

/** How wide Google actually drew its button, or null before it has. */
function drawnWidth(parent: HTMLElement) {
  const button = parent.querySelector("iframe") ?? parent.firstElementChild;
  return button ? button.getBoundingClientRect().width : null;
}

/**
 * Draws (or redraws) Google's button to fit our page: dark or light like the
 * site, as wide as the email button, square corners like ours.
 */
function paintButton(parent: HTMLElement) {
  const id = window.google?.accounts.id;
  if (!id) return false;
  const light = document.documentElement.classList.contains("light");
  parent.replaceChildren();
  const width = widthFor(parent);
  parent.dataset.width = String(width);
  id.renderButton(parent, {
    type: "standard",
    theme: light ? "outline" : "filled_black",
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    width,
    // The site is in English; Google would follow the browser's language.
    locale: "en",
  });
  return true;
}

/**
 * Google's own "Continue with Google" button, for signing in or for
 * connecting a Google account. The script loads with the page's CSP nonce;
 * until it has drawn the button, a neutral box of the same size holds the
 * place so nothing moves. It is redrawn when the column changes width or
 * the theme changes. Every attempt gets a fresh nonce: Google gets its
 * hash, and `onCredential` gets the raw value with the ID token.
 */
export function GoogleIdButton({
  clientId,
  scriptNonce,
  disabled = false,
  badge = null,
  busyLabel,
  onCredential,
  onUnavailable,
  className,
}: {
  clientId: string;
  scriptNonce?: string;
  disabled?: boolean;
  /** Laid over the top edge: we cannot draw inside Google's button. */
  badge?: React.ReactNode;
  /** Shown over the button while `onCredential` runs. */
  busyLabel: string;
  /**
   * Uses Google's ID token. Resolves true when it is done with it (the page
   * moves on), false to draw the button again with a new nonce.
   */
  onCredential: (credential: string, rawNonce: string) => Promise<boolean>;
  /** Google's script could not be loaded. */
  onUnavailable: () => void;
  className?: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const nonce = useRef<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // Aborted when the button leaves the page.
  const life = useRef<AbortController | null>(null);
  // Set once the pointer or focus has been on Google's button. Redrawing
  // removes Google's frame, and with its popup open that would drop the
  // token on the floor, so after that nothing is redrawn on its own.
  const touched = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    life.current = controller;
    const parent = mount.current;
    const touch = () => {
      touched.current = true;
    };
    // Events inside Google's frame stay there, but moving onto the frame,
    // pressing it and tabbing into it all reach its element here.
    const events = ["pointerover", "pointerdown", "focusin"] as const;
    for (const type of events) parent?.addEventListener(type, touch);
    return () => {
      controller.abort();
      for (const type of events) parent?.removeEventListener(type, touch);
    };
  }, []);

  useEffect(() => {
    const parent = mount.current;
    if (!drawn || signingIn || !parent) return;
    const redraw = () => {
      if (!touched.current) paintButton(parent);
    };
    const painted = () => Number(parent.dataset.width);
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (parent.clientWidth === 0) return;
            if (widthFor(parent) !== painted()) redraw();
          });
    resize?.observe(parent);
    const theme = new MutationObserver(redraw);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    // The personalized button ("Continue as ...") loads in a moment and has
    // come out narrow before. If it ends up narrower than asked for, draw it
    // again, twice at most.
    let retries = 2;
    const check = () => {
      const width = drawnWidth(parent);
      if (width === null || width >= painted() - 4 || retries === 0) return;
      retries--;
      redraw();
    };
    const timers = [400, 1500, 3000].map((ms) => setTimeout(check, ms));
    // Also cleared as soon as a sign-in starts.
    return () => {
      resize?.disconnect();
      theme.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [drawn, signingIn]);

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
    const signal = life.current?.signal;
    if (!signal) return;
    await laidOut(parent, signal);
    if (signal.aborted || !parent.isConnected) return;
    // Drawn on purpose (first time, or again after a failed sign-in, when
    // Google's popup has closed), so the automatic redraws may run again.
    touched.current = false;
    if (paintButton(parent)) setDrawn(true);
  }

  async function finish(credential: string) {
    const rawNonce = nonce.current;
    if (!rawNonce) return;
    setSigningIn(true);
    const done = await onCredential(credential, rawNonce).catch(() => false);
    if (done) return;
    setSigningIn(false);
    void draw();
  }

  return (
    <div className={cn("relative", className)}>
      {badge}
      {/* 40 pixels, the height of Google's large button and of our email
          button. Google's frame is a little bigger than the button inside
          it, so the overhang is clipped. */}
      <div
        className="relative h-10 overflow-hidden rounded-[4px]"
        aria-busy={signingIn || undefined}
      >
        <Script
          src={GSI_SCRIPT}
          nonce={scriptNonce}
          strategy="afterInteractive"
          onReady={() => void draw()}
          onError={onUnavailable}
        />
        {!drawn ? (
          // Where Google's button will be, until its script has drawn it.
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-[4px] border bg-card"
          />
        ) : null}
        {signingIn ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled
            className="absolute inset-0 z-10 h-10 w-full"
          >
            <GoogleGlyph />
            {busyLabel}
          </Button>
        ) : disabled && drawn ? (
          // Busy with the email link: Google's button cannot be disabled, so
          // a cover keeps it from being clicked.
          <div
            aria-hidden="true"
            className="absolute inset-0 z-10 cursor-not-allowed rounded-[4px] bg-background/50"
          />
        ) : null}
        {/* Chrome paints a frame white when its color scheme differs from
          the page's. Google's button frame is light, so this one is too,
          which keeps it see-through on our dark theme. */}
        <div
          ref={mount}
          data-testid="google-button"
          className="flex h-10 w-full items-center [color-scheme:light]"
        />
      </div>
    </div>
  );
}

export function GoogleGlyph() {
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
