import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { getGenres } from "@/lib/data/profiles";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { Uploader } from "./uploader";

export const metadata: Metadata = {
  title: "Upload a track",
  robots: { index: false },
};

export default async function UploadPage() {
  const [viewer, genres] = await Promise.all([getViewer(), getGenres()]);
  if (!viewer) redirect("/login?next=/upload");
  // A track is published under the username, so that comes first.
  if (!viewer.onboarded) redirect("/welcome?next=/upload");
  // How experienced: the answer from the last track, so it is not asked
  // every time.
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("tracks")
    .select("level")
    .eq("owner_id", viewer.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (
    <div className="px-4 py-8 sm:py-12">
      <h1 className="sr-only">Upload a track</h1>
      <Uploader
        genres={genres}
        contactEmail={site.contactEmail}
        level={last?.level ?? null}
      />
    </div>
  );
}
