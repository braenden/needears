"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { requestIdentityIntent } from "@/lib/auth/identity-intent";
import { browserClient } from "@/lib/supabase/lazy";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where the confirmation links lead back to: Settings. */
export const EMAIL_CHANGE_NEXT = "/settings";

type State =
  | { step: "form"; error: string | null; sending: boolean }
  | { step: "sent"; to: string }
  | { step: "reauth" };

/**
 * What went wrong when sending the links, for the person. Asking for a
 * fresh sign-in is only for our own server's answer, before this.
 */
export function emailChangeError(error: {
  status?: number;
  code?: string;
}): string {
  // Neutral on purpose: it does not say whether the address has an account.
  if (error.code === "email_exists" || error.code === "email_address_taken")
    return "We can't use that address. Try another one.";
  if (error.status === 429 || error.code === "over_email_send_rate_limit")
    return "Too many emails. Wait a minute and try again.";
  if (
    error.code === "email_address_invalid" ||
    error.code === "validation_failed"
  )
    return "Enter a valid email address.";
  return "We couldn't send the email. Try again in a minute.";
}

/** How long our server's go-ahead lasts, less a margin. */
const INTENT_MS = 4 * 60 * 1000;

/**
 * Change the account's email address. A link goes to both the current and
 * the new address, and the change happens when one of them is opened.
 */
/** The address typed before signing in again, for when they come back. */
const TYPED_KEY = "needears:new-email";

export function ChangeEmail({
  current,
  fresh,
}: {
  current: string | null;
  /** Signed in recently enough to change it now. */
  fresh: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // When our server last gave a go-ahead. A retry within its lifetime does
  // not ask again, so other devices are not signed out a second time.
  const intentAt = useRef(0);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({
    step: "form",
    error: null,
    sending: false,
  });

  // Back from signing in again: the form opens with what they typed.
  useEffect(() => {
    if (!fresh) return;
    const frame = requestAnimationFrame(() => {
      let typed: string | null = null;
      try {
        typed = sessionStorage.getItem(TYPED_KEY);
        sessionStorage.removeItem(TYPED_KEY);
      } catch {
        // Nothing kept.
      }
      if (!typed) return;
      setEmail(typed);
      setOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [fresh]);

  /** Off to sign in again, keeping what was typed. */
  function needFreshSignIn() {
    try {
      if (email.trim()) sessionStorage.setItem(TYPED_KEY, email.trim());
    } catch {
      // Not kept.
    }
    setState({ step: "reauth" });
  }

  const problem = (value: string) => {
    const address = value.trim();
    if (!EMAIL_PATTERN.test(address)) return "Enter a valid email address.";
    if (current && address.toLowerCase() === current.toLowerCase())
      return "That's the address you already use.";
    return null;
  };

  async function send() {
    if (state.step !== "form" || state.sending) return;
    const issue = problem(email);
    if (issue) {
      setState({ step: "form", error: issue, sending: false });
      return;
    }
    setState({ step: "form", error: null, sending: true });
    // Our server's go-ahead first: only for a recent sign-in, and it signs
    // out the account's other sessions.
    if (Date.now() - intentAt.current > INTENT_MS) {
      const intent = await requestIdentityIntent("email_change", "email");
      if (intent === "reauth") {
        needFreshSignIn();
        return;
      }
      if (intent === "failed") {
        setState({
          step: "form",
          error: "Something broke on our side. Try again in a minute.",
          sending: false,
        });
        return;
      }
      intentAt.current = Date.now();
    }
    const address = email.trim();
    const { error } = await (
      await browserClient()
    ).auth.updateUser(
      { email: address },
      {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(EMAIL_CHANGE_NEXT)}`,
      },
    );
    if (!error) {
      // Used up.
      intentAt.current = 0;
      setState({ step: "sent", to: address });
      return;
    }
    setState({ step: "form", error: emailChangeError(error), sending: false });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // An older sign-in is told at once, before typing anything.
        if (next && !fresh) setState({ step: "reauth" });
        if (!next) {
          setEmail("");
          setState({ step: "form", error: null, sending: false });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Change
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {state.step === "reauth" ? (
          <>
            <DialogHeader>
              <DialogTitle>Sign in again first</DialogTitle>
              <DialogDescription>
                To keep your account safe, sign in again before you change your
                email. Then come back here within ten minutes.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button asChild>
                <Link href="/login?reauth=email&next=%2Fsettings%23account-heading">
                  Sign in again
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : state.step === "sent" ? (
          <>
            <DialogHeader>
              <DialogTitle>Check your inbox</DialogTitle>
              <DialogDescription>
                We sent a link to {state.to}, and one to{" "}
                {current ?? "your current address"} too. Open one of them to
                finish. Until then you keep using{" "}
                {current ?? "your current address"}. To keep your account safe,
                you&apos;re now signed out on your other devices.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button">Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <DialogHeader>
              <DialogTitle>Change your email</DialogTitle>
              <DialogDescription>
                You sign in with this address, and it&apos;s where we write to
                you. We&apos;ll send a link to confirm the change.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <label htmlFor={`${id}-email`} className="text-sm font-medium">
                New email
              </label>
              <Input
                id={`${id}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // The error goes as soon as the address is fine.
                  if (state.error)
                    setState({
                      step: "form",
                      error: problem(e.target.value),
                      sending: false,
                    });
                }}
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? `${id}-error` : undefined}
              />
              {state.error ? (
                <p
                  id={`${id}-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {state.error}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={state.sending}>
                {state.sending ? (
                  <Loader2Icon className="animate-spin" />
                ) : null}
                Send links
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
