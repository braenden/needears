"use client";

import { useEffect } from "react";

import { SIGNED_IN_HASH, saveLastLogin } from "@/lib/auth/last-login";
import { announceSignedIn } from "@/lib/auth/signed-in-elsewhere";

/**
 * After a magic link, /auth/callback sends people on with #signed-in=email.
 * This saves that as the last way they signed in, tells the tab that sent
 * the link (it moves on too) and takes it out of the address bar.
 */
export function RememberLogin() {
  useEffect(() => {
    if (window.location.hash !== SIGNED_IN_HASH) return;
    saveLastLogin("email");
    announceSignedIn();
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return null;
}
