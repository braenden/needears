"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Loader2Icon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callbackUrl } from "@/lib/auth/callback-url";
import { readLastLogin } from "@/lib/auth/last-login";
import { cn } from "@/lib/utils";
import { browserClient } from "@/lib/supabase/lazy";
import { GoogleButton } from "./google-button";

// The last login only changes when signing in, which leaves this page.
const noSubscription = () => () => {};

export function LoginForm({
  next,
  googleClientId,
  scriptNonce,
}: {
  next: string;
  /** Without it, only the email link is offered. */
  googleClientId: string | null;
  scriptNonce?: string;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  // Google has handed over its token and the session is being made.
  const [signingIn, setSigningIn] = useState(false);
  // Only in the browser (the server renders without it), and only worth
  // pointing at when there is a choice. Its line is there either way, so it
  // appearing moves nothing.
  const lastUsed = useSyncExternalStore(
    noSubscription,
    () => (googleClientId ? readLastLogin() : null),
    () => null,
  );

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setState("sending");
    const { error } = await (
      await browserClient()
    ).auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl(next) },
    });
    if (error) {
      setState("idle");
      setError(
        error.status === 429
          ? "Too many sign-in emails. Wait a minute and try again."
          : "We couldn't send the link. Check the address and try again.",
      );
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div role="status" className="mt-8 rounded-xl border bg-card p-5">
        <MailIcon className="size-5 text-primary-text" aria-hidden="true" />
        <p className="mt-3 font-semibold">Check your email.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a link to {email.trim()}. It works for one hour.
        </p>
        <Button
          variant="link"
          className="mt-3"
          onClick={() => setState("idle")}
        >
          Use another address
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      {googleClientId ? (
        <p className="min-h-5 text-sm text-muted-foreground">
          {lastUsed
            ? `You signed in with ${lastUsed === "google" ? "Google" : "email"} last time.`
            : null}
        </p>
      ) : null}
      {/* While signing in, one message in place of both ways in. Google's
          button stays underneath, hidden, so it can be drawn again if the
          sign-in fails. */}
      <div className="relative">
        <div
          className={cn("grid gap-6", signingIn && "invisible")}
          aria-hidden={signingIn || undefined}
        >
          {googleClientId ? (
            <>
              <GoogleButton
                clientId={googleClientId}
                next={next}
                scriptNonce={scriptNonce}
                disabled={state !== "idle"}
                onBusy={setSigningIn}
                onError={setError}
              />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                or
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>
            </>
          ) : null}
          <form noValidate onSubmit={sendLink} className="grid gap-3">
            <label htmlFor={`${id}-email`} className="text-sm font-medium">
              Email
            </label>
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {/* As tall as Google's button above it. */}
            <Button
              type="submit"
              size="lg"
              disabled={state !== "idle"}
              className="h-10"
            >
              {state === "sending" ? (
                <Loader2Icon className="motion-safe:animate-spin" />
              ) : null}
              Email me a sign-in link
            </Button>
          </form>
        </div>
        {signingIn ? (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl border bg-card text-sm font-medium"
          >
            <Loader2Icon
              className="size-4 motion-safe:animate-spin"
              aria-hidden="true"
            />
            Signing you in…
          </div>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
