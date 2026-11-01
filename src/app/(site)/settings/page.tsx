import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isFreshSession, REAUTH_WINDOW_MS } from "@/lib/api/reauth";
import { googleClientId } from "@/lib/auth/google-client-id";
import { googleClientSecret } from "@/lib/auth/google-code";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { EDIT_PROFILE_HREF } from "@/components/shell/nav";
import { ConnectedAccounts } from "./connected-accounts";
import { DeleteAccount } from "./delete-account";
import { TrackManager } from "./track-manager";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false },
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="scroll-mt-20 border-t py-8 first:border-t-0 first:pt-0"
    >
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const SECTIONS = [
  [EDIT_PROFILE_HREF, "Profile"],
  ["#account-heading", "Account"],
  ["#tracks-heading", "Your tracks"],
  ["#data-heading", "Your data"],
  ["#delete-heading", "Delete account"],
] as const;

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/settings");
  const supabase = await createClient();
  const [{ data: tracks }, { data: ids }, { data: claims }] = await Promise.all(
    [
      supabase
        .from("tracks")
        .select("id, slug, title, status, published_at")
        .eq("owner_id", viewer.userId)
        .order("published_at", { ascending: false }),
      // The ways this person can sign in (email link, Google).
      supabase.auth.getUserIdentities(),
      // When this session signed in, for connecting Google.
      supabase.auth.getClaims(),
    ],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Settings
      </h1>

      <div className="mt-6 grid gap-8 md:grid-cols-[10rem_minmax(0,1fr)]">
        {/* Down the side on wide screens, a row on phones. The profile
            has its own page: everything on it is public. */}
        <nav
          aria-label="Settings sections"
          className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 md:sticky md:top-20 md:mx-0 md:self-start md:px-0"
        >
          <ul className="flex gap-1 md:flex-col">
            {SECTIONS.map(([href, label]) => (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  className="flex h-9 items-center rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground focus-ring outline-none hover:bg-accent hover:text-foreground md:-ml-3"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <Section id="account-heading" title="Account">
            <ConnectedAccounts
              identities={ids?.identities ?? []}
              accountEmail={
                typeof claims?.claims.email === "string"
                  ? claims.claims.email
                  : null
              }
              // Connecting swaps Google's code on our server, which needs
              // the client secret as well.
              googleClientId={googleClientSecret() ? googleClientId() : null}
              scriptNonce={(await headers()).get("x-nonce") ?? undefined}
              fresh={isFreshSession(claims?.claims.amr, REAUTH_WINDOW_MS)}
            />
          </Section>

          <Section id="tracks-heading" title="Your tracks">
            <TrackManager tracks={tracks ?? []} />
          </Section>

          <Section id="data-heading" title="Your data">
            <p className="text-sm text-muted-foreground">
              Everything we store about you (account, profile, tracks, comments,
              reactions, reports and notifications) as one file.
            </p>
            <a
              href="/api/account/export"
              className="mt-3 inline-flex h-9 items-center rounded-md border px-3.5 text-sm font-medium focus-ring outline-none hover:bg-accent"
            >
              Download my data
            </a>
            <p className="mt-3 text-sm text-muted-foreground">
              How we handle it is in the{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                privacy policy
              </Link>
              .
            </p>
          </Section>

          <Section id="delete-heading" title="Delete account">
            <DeleteAccount handle={viewer.profile.handle} />
          </Section>
        </div>
      </div>
    </div>
  );
}
