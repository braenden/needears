"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { Loader2Icon, MailIcon } from "lucide-react";
import { toast } from "sonner";

import {
  GoogleGlyph,
  GoogleIdButton,
} from "@/components/auth/google-id-button";
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
import { requestIdentityIntent } from "@/lib/auth/identity-intent";
import { browserClient } from "@/lib/supabase/lazy";

/** Where to prove it is you again before connecting Google. */
export const REAUTH_TO_CONNECT = "/login?reauth=connect&next=%2Fsettings";

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

/**
 * What to say when connecting Google did not work. Supabase's own reasons
 * come through; anything our database refuses arrives as a general error,
 * so it gets the general message.
 */
export function linkErrorText(code: string | undefined): string {
  if (code === "identity_already_exists")
    return "That Google account already belongs to another profile.";
  if (code === "manual_linking_disabled")
    return "Connecting a Google account isn't available right now.";
  return "Couldn't connect Google. Try again, or come back in a minute.";
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * What to say when disconnecting did not work. The way to sign in that uses
 * the account's own address cannot be removed for a day after another one
 * was added. The refusal cannot be told apart from other errors, so that
 * situation is what points to it.
 */
export function unlinkErrorText(
  identities: UserIdentity[],
  removing: UserIdentity,
  accountEmail: string | null,
  now: number = Date.now(),
): string {
  const carriesAccount =
    !!accountEmail &&
    emailOf(removing)?.toLowerCase() === accountEmail.toLowerCase();
  const newestOther = Math.max(
    0,
    ...identities
      .filter((i) => i.id !== removing.id)
      .map((i) => (i.created_at ? Date.parse(i.created_at) : 0)),
  );
  if (carriesAccount && now - newestOther < DAY)
    return "For your safety, this way to sign in can't be removed for a day after another one was added. Try again tomorrow.";
  return "Couldn't disconnect Google. Try again, or come back in a minute.";
}

/** Said next to the buttons, before anyone presses them. */
export const SIGNS_OUT_ELSEWHERE =
  "Connecting or disconnecting Google signs you out on your other devices.";

/** What disconnecting Google means for this person. */
export function disconnectText(
  googleEmail: string | null,
  accountEmail: string | null,
): string {
  const same =
    !!googleEmail &&
    !!accountEmail &&
    googleEmail.toLowerCase() === accountEmail.toLowerCase();
  if (same)
    return `Your Google account uses the same address as your profile (${accountEmail}), so signing in with Google keeps working: it connects again by itself. Disconnecting only matters for a Google account with another address.`;
  return `You can no longer sign in with ${googleEmail ?? "Google"}. You still sign in with an email link to ${accountEmail ?? "your address"}.`;
}

/**
 * The ways someone can sign in: the email link and Google. A Google account
 * can be connected (also one with another address) and disconnected again,
 * as long as the email link is still there to sign in with. Connecting
 * needs a recent sign-in, like deleting the account.
 */
export function ConnectedAccounts({
  identities,
  accountEmail,
  googleClientId,
  scriptNonce,
  fresh,
}: {
  identities: UserIdentity[];
  /** The account's own address. */
  accountEmail: string | null;
  /** Without it, Google cannot be connected here. */
  googleClientId: string | null;
  scriptNonce?: string;
  /** This session signed in recently enough to connect Google. */
  fresh: boolean;
}) {
  const router = useRouter();
  const { email, google } = accountsOf(identities);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Asks our server for the go-ahead. False when the person has been sent
  // to sign in again, or it failed (and they have been told).
  async function goAhead(action: "link" | "unlink") {
    const result = await requestIdentityIntent(action, "google");
    if (result === "ok") return true;
    if (result === "reauth") {
      toast("Sign in again to change how you sign in.");
      router.push(REAUTH_TO_CONNECT);
    } else {
      toast.error("Something broke on our side. Try again in a minute.");
    }
    return false;
  }

  async function connect(credential: string, rawNonce: string) {
    if (!(await goAhead("link"))) return true;
    const { error } = await (
      await browserClient()
    ).auth.linkIdentity({
      provider: "google",
      token: credential,
      nonce: rawNonce,
    });
    if (error) {
      toast.error(linkErrorText(error.code));
      return false;
    }
    toast.success("Google connected.");
    router.refresh();
    return true;
  }

  async function disconnect() {
    if (!google || !email) return;
    setDisconnecting(true);
    if (!(await goAhead("unlink"))) {
      setDisconnecting(false);
      setConfirming(false);
      return;
    }
    const { error } = await (await browserClient()).auth.unlinkIdentity(google);
    setDisconnecting(false);
    setConfirming(false);
    if (error) {
      toast.error(
        error.code === "manual_linking_disabled"
          ? "Disconnecting Google isn't available right now."
          : unlinkErrorText(identities, google, accountEmail),
      );
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
        <li className="grid gap-3 px-4 py-3">
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
                disabled={!email || disconnecting}
                aria-describedby={email ? undefined : "google-only-note"}
                onClick={() => setConfirming(true)}
              >
                Disconnect
              </Button>
            ) : googleClientId && !fresh ? (
              <Button asChild variant="outline" size="sm">
                <Link href={REAUTH_TO_CONNECT}>Connect Google</Link>
              </Button>
            ) : null}
          </div>
          {!google && googleClientId && fresh ? (
            <GoogleIdButton
              clientId={googleClientId}
              scriptNonce={scriptNonce}
              busyLabel="Connecting…"
              // Google draws its button at most 400 pixels wide.
              className="max-w-[400px]"
              onCredential={connect}
              onUnavailable={() =>
                toast.error(
                  "Google isn't available right now. Try again in a minute.",
                )
              }
            />
          ) : null}
          {!google && googleClientId && !fresh ? (
            <p className="text-sm text-muted-foreground">
              To connect Google, sign in again first. You come straight back
              here.
            </p>
          ) : null}
          {(!google && googleClientId) || (google && email) ? (
            <p className="text-sm text-muted-foreground">
              {SIGNS_OUT_ELSEWHERE}
            </p>
          ) : null}
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
              {disconnectText(emailOf(google), accountEmail ?? emailOf(email))}
            </DialogDescription>
            <p className="text-sm text-muted-foreground">
              You&apos;ll also be signed out on your other devices.
            </p>
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
              disabled={disconnecting}
              onClick={() => void disconnect()}
            >
              {disconnecting ? (
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
