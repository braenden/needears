import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { parseLinks } from "@/lib/data/profiles";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccount } from "./delete-account";
import { EmailSettings } from "./email-settings";
import { ExtrasSettings, PhotoSettings } from "./profile-extras";
import { ProfileForm } from "./profile-form";
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
    <section aria-labelledby={id} className="border-t py-8 first:border-t-0">
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
  const [{ data: tracks }, { data: prefs }] = await Promise.all([
    supabase
      .from("tracks")
      .select("id, slug, title, status, published_at")
      .eq("owner_id", viewer.userId)
      .order("published_at", { ascending: false }),
    supabase
      .from("profiles")
      .select(
        "email_notifications, avatar_key, avatar_url, working_on, daw, links",
      )
      .eq("id", viewer.userId)
      .single(),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Settings
      </h1>

      <div className="mt-6">
        <Section id="profile-heading" title="Profile">
          <div className="grid gap-8">
            <PhotoSettings
              userId={viewer.userId}
              profile={viewer.profile}
              avatarKey={prefs?.avatar_key ?? null}
              googleAvatar={prefs?.avatar_url ?? null}
            />
            <ProfileForm userId={viewer.userId} profile={viewer.profile} />
          </div>
        </Section>

        <Section id="music-heading" title="Your music">
          <ExtrasSettings
            userId={viewer.userId}
            initial={{
              workingOn: prefs?.working_on ?? "",
              daw: prefs?.daw ?? "",
              links: parseLinks(prefs?.links ?? []),
            }}
          />
        </Section>

        <Section id="email-heading" title="Email">
          <EmailSettings
            userId={viewer.userId}
            initial={prefs?.email_notifications ?? true}
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
            className="mt-3 inline-flex h-9 items-center rounded-md border px-3.5 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
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
  );
}
