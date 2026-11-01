import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/api/redirect";
import { getViewer } from "@/lib/data/viewer";
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
    // A narrow form in the page column, so the heading starts on the same
    // edge as on every other page.
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <div className="max-w-sm">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Pick a username
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is your name on Need Ears. It shows up in your profile link.
        </p>
        <HandleForm
          userId={viewer.userId}
          initialHandle={viewer.profile.handle}
          initialDisplayName={viewer.profile.display_name}
          next={next}
        />
      </div>
    </div>
  );
}
