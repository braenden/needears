import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { getGroupBySlug, getMyGroups, getRole } from "@/lib/data/groups";
import { getGenres } from "@/lib/data/profiles";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { Page } from "@/components/shell/page";
import { Uploader } from "./uploader";

export const metadata: Metadata = {
  title: "Upload a track",
  robots: { index: false },
};

export default async function UploadPage({
  searchParams,
}: PageProps<"/upload">) {
  const query = await searchParams;
  const slug = typeof query.group === "string" ? query.group : null;
  const here = slug
    ? `/upload?${new URLSearchParams({ group: slug })}`
    : "/upload";
  const [viewer, genres] = await Promise.all([getViewer(), getGenres()]);
  if (!viewer) redirect(`/login?${new URLSearchParams({ next: here })}`);
  // A track is published under the username, so that comes first.
  if (!viewer.onboarded)
    redirect(`/welcome?${new URLSearchParams({ next: here })}`);
  // From a group's page: only for its members. Anyone else is sent to the
  // group, which tells them it is for members.
  const [group, mine] = await Promise.all([
    slug ? getGroupBySlug(slug) : Promise.resolve(null),
    slug ? Promise.resolve([]) : getMyGroups(),
  ]);
  if (slug && (!group || !(await getRole(group.id, viewer.userId))))
    redirect(`/g/${encodeURIComponent(slug)}`);
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
    <Page width="narrow">
      <h1 className="sr-only">Upload a track</h1>
      <Uploader
        genres={genres}
        contactEmail={site.contactEmail}
        level={last?.level ?? null}
        group={
          group ? { id: group.id, slug: group.slug, name: group.name } : null
        }
        memberOf={mine.map((g) => ({ slug: g.slug, name: g.name }))}
      />
    </Page>
  );
}
