"use client";

import { useId, useState } from "react";
import { Loader2Icon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { browserClient } from "@/lib/supabase/lazy";
import { GoogleButton } from "./google-button";

function callbackUrl(next: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}

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
    <div className="mt-8 grid gap-6">
      {googleClientId ? (
        <>
          <GoogleButton
            clientId={googleClientId}
            next={next}
            scriptNonce={scriptNonce}
            disabled={state !== "idle"}
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
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
