"use client";

import { useId, useState } from "react";
import { Loader2Icon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { browserClient } from "@/lib/supabase/lazy";

function callbackUrl(next: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}

export function LoginForm({ next }: { next: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "google" | "sending" | "sent">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function google() {
    setError(null);
    setState("google");
    const { error } = await (
      await browserClient()
    ).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) {
      setState("idle");
      setError("Google sign-in isn't available right now. Try the email link.");
    }
  }

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
      <Button
        type="button"
        size="lg"
        variant="outline"
        onClick={() => void google()}
        disabled={state !== "idle"}
      >
        {state === "google" ? (
          <Loader2Icon className="motion-safe:animate-spin" />
        ) : (
          <GoogleGlyph />
        )}
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        or
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
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
        <Button type="submit" size="lg" disabled={state !== "idle"}>
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
