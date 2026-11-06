"use client";

import { useEffect } from "react";

import { saveLastLogin, signedInMethod } from "@/lib/auth/last-login";
import { announceSignedIn } from "@/lib/auth/signed-in-elsewhere";

/**
 * After signing in, /auth/callback sends people on with #signed-in=email
 * (or google).
 * This saves that as the last way they signed in, tells the tab that sent
 * the link (it moves on too) and takes it out of the address bar.
 */
export function RememberLogin() {
  useEffect(() => {
    const method = signedInMethod(window.location.hash);
    if (!method) return;
    saveLastLogin(method);
    announceSignedIn();
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return null;
}
