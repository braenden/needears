import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isFreshSession, REAUTH_WINDOW_MS } from "@/lib/api/reauth";
import { googleClientId } from "@/lib/auth/google-client-id";
import { googleClientSecret } from "@/lib/auth/google-code";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { EDIT_PROFILE_HREF } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { ConnectedAccounts } from "./connected-accounts";
import { DeleteAccount } from "./delete-account";
import { TrackManager } from "./track-manager";
import { Page, PageTitle } from "@/components/shell/page";

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
    <Page width="narrow">
      <PageTitle>Settings</PageTitle>

      <div className="mt-8">
        <Section id="profile-heading" title="Profile">
          <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <UserAvatar profile={viewer.profile} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {displayNameOf(viewer.profile)}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                @{viewer.profile.handle}
              </p>
            </div>
            {/* Like the account menu: on wide screens the editor opens as
                a panel over the profile, on phones it is a page of its
                own. */}
            <Button asChild variant="outline" size="sm" className="sm:hidden">
              <Link href={EDIT_PROFILE_HREF} aria-label="Edit profile">
                Edit
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="max-sm:hidden"
            >
              <Link
                href={`/u/${viewer.profile.handle}?edit=profile`}
                aria-label="Edit profile"
              >
                Edit
              </Link>
            </Button>
          </div>
        </Section>

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
    </Page>
  );
}
