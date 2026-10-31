"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { Loader2Icon, MailIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { callbackUrl } from "@/lib/auth/callback-url";
import { browserClient } from "@/lib/supabase/lazy";

/** The identities that matter here: the email one and Google. */
export function accountsOf(identities: UserIdentity[]) {
  return {
    email: identities.find((i) => i.provider === "email") ?? null,
    google: identities.find((i) => i.provider === "google") ?? null,
  };
}

const emailOf = (identity: UserIdentity | null) =>
  typeof identity?.identity_data?.email === "string"
    ? identity.identity_data.email
    : null;

/** What to say when connecting Google did not work. */
export function linkErrorText(code: string): string {
  if (code === "identity_already_exists")
    return "That Google account already belongs to another profile.";
  if (code === "manual_linking_disabled")
    return "Connecting a Google account isn't available right now.";
  if (code === "access_denied")
    return "Google wasn't connected. You can try again any time.";
  return "Couldn't connect Google. Try again, or come back in a minute.";
}

/**
 * The ways someone can sign in: the email link and Google. A Google account
 * can be connected (also one with another address) and disconnected again,
 * as long as the email link is still there to sign in with.
 */
export function ConnectedAccounts({
  identities,
  linked = false,
  linkError = null,
}: {
  identities: UserIdentity[];
  /** Back from connecting Google (?linked=google). */
  linked?: boolean;
  /** Back from a failed attempt (?link_error=...). */
  linkError?: string | null;
}) {
  const router = useRouter();
  const { email, google } = accountsOf(identities);
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Say how connecting went, once, and take it out of the address.
  useEffect(() => {
    if (!linked && !linkError) return;
    if (linkError) toast.error(linkErrorText(linkError));
    else toast.success("Google connected.");
    const url = new URL(window.location.href);
    url.searchParams.delete("linked");
    url.searchParams.delete("link_error");
    window.history.replaceState(window.history.state, "", url);
  }, [linked, linkError]);

  async function connect() {
    setBusy("connect");
    const { error } = await (
      await browserClient()
    ).auth.linkIdentity({
      provider: "google",
      options: { redirectTo: callbackUrl("/settings?linked=google") },
    });
    // On success the browser is on its way to Google.
    if (error) {
      setBusy(null);
      toast.error(linkErrorText(error.code ?? "failed"));
    }
  }

  async function disconnect() {
    if (!google || !email) return;
    setBusy("disconnect");
    const { error } = await (await browserClient()).auth.unlinkIdentity(google);
    setBusy(null);
    setConfirming(false);
    if (error) {
      toast.error("Couldn't disconnect Google. Try again.");
      return;
    }
    toast.success("Google disconnected.");
    router.refresh();
  }

  return (
    <div>
      <ul className="divide-y rounded-xl border">
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <MailIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-sm font-medium">Email</span>
          <span className="min-w-0 flex-1 truncate text-right text-sm text-muted-foreground">
            {emailOf(email) ?? "Not set up"}
          </span>
        </li>
        <li className="grid gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <GoogleGlyph />
            <span className="text-sm font-medium">Google</span>
            <span className="min-w-0 flex-1 truncate text-right text-sm text-muted-foreground">
              {google ? (emailOf(google) ?? "Connected") : "Not connected"}
            </span>
            {google ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!email || busy !== null}
                aria-describedby={email ? undefined : "google-only-note"}
                onClick={() => setConfirming(true)}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void connect()}
              >
                {busy === "connect" ? (
                  <Loader2Icon className="motion-safe:animate-spin" />
                ) : null}
                Connect Google
              </Button>
            )}
          </div>
          {google && !email ? (
            <p id="google-only-note" className="text-sm text-muted-foreground">
              Add a way to sign in with email first. Sign in once with an email
              link to your address, and you can disconnect Google after that.
            </p>
          ) : null}
        </li>
      </ul>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Google?</DialogTitle>
            <DialogDescription>
              You can no longer sign in with {emailOf(google) ?? "Google"}. You
              still sign in with an email link to {emailOf(email)}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={busy !== null}
              onClick={() => void disconnect()}
            >
              {busy === "disconnect" ? (
                <Loader2Icon className="motion-safe:animate-spin" />
              ) : null}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0">
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
