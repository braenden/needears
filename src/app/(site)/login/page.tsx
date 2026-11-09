import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/api/redirect";
import { googleClientId } from "@/lib/auth/google-client-id";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

const ORIGIN = "https://needears.invalid";

// Only same-site paths survive, as in /auth/callback.
function nextPath(value: string | string[] | undefined): string {
  const url = safeNext(typeof value === "string" ? value : null, ORIGIN);
  return url.pathname + url.search;
}

async function signedInEmail(): Promise<string | null> {
  const { data } = await (await createClient()).auth.getClaims();
  const email = data?.claims.email;
  return typeof email === "string" && email ? email : null;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = nextPath(params.next);
  // ?reauth asks a signed in person to prove it again: before deleting the
  // account (1), connecting or disconnecting Google (connect) or changing
  // the email address (email).
  const reauth =
    params.reauth === "1" ||
    params.reauth === "connect" ||
    params.reauth === "email"
      ? params.reauth
      : null;
  // A link back to Settings is the email change's: opened in another
  // browser it cannot sign in there, though the change itself may be done.
  const fromSettings = next.startsWith("/settings");
  if (!reauth && (await getViewer())) redirect(next === "/" ? "/feed" : next);
  // Signing in again: the account's own address, so nobody has to type it
  // (or signs in to another account by mistake).
  const accountEmail = reauth ? await signedInEmail() : null;
  return (
    // One short task: one centred column, nothing else on the page.
    <div className="w-full px-4 py-16 sm:py-28">
      <div className="mx-auto max-w-sm text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {reauth ? "Sign in again" : "Sign in"}
        </h1>
        {/* Only when signing in again: then it needs saying why. */}
        {reauth ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {reauth === "connect"
              ? "Sign in again to change how you sign in. For your safety, connecting or disconnecting Google needs a recent sign-in."
              : reauth === "email"
                ? "Sign in again to change your email address. For your safety, it needs a recent sign-in."
                : "To delete your account, sign in again with the same Google account or email as before."}
          </p>
        ) : null}
        {params.error && fromSettings ? (
          <p role="alert" className="mt-4 text-sm text-muted-foreground">
            That link can&apos;t sign you in here, but your email change may
            have gone through. Sign in and check the address in Settings.
          </p>
        ) : params.error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            That sign-in link didn&apos;t work. It may have expired or been used
            already. Ask for a new one.
          </p>
        ) : null}
        <LoginForm
          next={next}
          // Signing in again to connect Google: Google is not connected yet,
          // and a Google account with another address would make a new
          // account and sign this one out. Only the email link here.
          googleClientId={reauth === "connect" ? null : googleClientId()}
          scriptNonce={(await headers()).get("x-nonce") ?? undefined}
          defaultEmail={accountEmail ?? undefined}
          reauth={!!reauth}
        />
        <p className="mt-8 text-xs text-muted-foreground">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          , and confirm you&apos;re at least 13.
        </p>
      </div>
    </div>
  );
}
