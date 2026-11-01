import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/api/redirect";
import { googleClientId } from "@/lib/auth/google-client-id";
import { getViewer } from "@/lib/data/viewer";
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

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = nextPath(params.next);
  // ?reauth asks a signed in person to prove it again: before deleting the
  // account (1) or connecting or disconnecting Google (connect).
  const reauth =
    params.reauth === "1" || params.reauth === "connect" ? params.reauth : null;
  if (!reauth && (await getViewer())) redirect(next === "/" ? "/feed" : next);
  return (
    // A narrow form in the page column, so the heading starts on the same
    // edge as on every other page.
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <div className="max-w-sm">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {reauth ? "Sign in again" : "Sign in to Need Ears"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {reauth === "connect"
            ? "Sign in again to change how you sign in. For your safety, connecting or disconnecting Google needs a recent sign-in."
            : reauth
              ? "To delete your account, sign in again with the same Google account or email as before."
              : "Sign in to upload tracks and leave comments."}
        </p>
        {params.error ? (
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
