import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/api/redirect";
import { getViewer } from "@/lib/data/viewer";
import { Page, PageTitle } from "@/components/shell/page";
import { HandleForm } from "./handle-form";

export const metadata: Metadata = {
  title: "Pick a username",
  robots: { index: false },
};

export default async function WelcomePage({
  searchParams,
}: PageProps<"/welcome">) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  const raw = typeof params.next === "string" ? params.next : null;
  const url = safeNext(raw, "https://needears.invalid");
  const next = url.pathname === "/" ? "/feed" : url.pathname + url.search;
  if (!viewer) redirect(`/login?next=${encodeURIComponent("/welcome")}`);
  return (
    // One short task, framed like signing in: the step before it.
    <Page width="task">
      <PageTitle>Pick a username</PageTitle>
      <p className="mt-2 text-sm text-muted-foreground">
        This is your name on Need Ears. It shows up in your profile link.
      </p>
      <HandleForm
        userId={viewer.userId}
        // The first time, an empty field: the placeholder handle from
        // sign up is not a name anyone chose.
        initialHandle={viewer.onboarded ? viewer.profile.handle : ""}
        // A name from the sign in (Google) stays; one made from the
        // placeholder handle goes.
        initialDisplayName={
          viewer.profile.display_name === viewer.profile.handle
            ? ""
            : viewer.profile.display_name
        }
        next={next}
      />
    </Page>
  );
}
