import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { type AdminReport, ReportCard } from "./report-card";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
};

const REPORT_COLUMNS = `id, reason, details, reported_text, status, created_at, target_type,
  reporter:profiles!reports_reporter_id_fkey(handle),
  track:tracks!reports_track_id_fkey(id, slug, title, description, status,
    owner:profiles!tracks_owner_id_fkey(id, handle, banned_at)),
  comment:comments!reports_comment_id_fkey(id, body, status, time_ms,
    author:profiles!comments_author_id_fkey(id, handle, banned_at),
    track:tracks!comments_track_id_fkey(slug, title))`;

export default async function AdminPage() {
  const viewer = await getViewer();
  // Not found rather than forbidden: the page does not exist for others.
  if (!viewer?.isAdmin) notFound();
  const supabase = await createClient();
  const [open, closed] = await Promise.all([
    supabase
      .from("reports")
      .select(REPORT_COLUMNS)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("reports")
      .select(REPORT_COLUMNS)
      .neq("status", "open")
      .order("resolved_at", { ascending: false })
      .limit(20),
  ]);
  const openReports = (open.data ?? []) as unknown as AdminReport[];
  const closedReports = (closed.data ?? []) as unknown as AdminReport[];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Admin
        </h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/stats">Stats</Link>
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Three open reports from different accounts hide a track or comment until
        you look at it. Hiding and removing keep the record; a ban hides
        everything the person posts.
      </p>

      <section aria-labelledby="open-heading" className="mt-8">
        <h2 id="open-heading" className="text-xl font-semibold tracking-tight">
          Open reports{" "}
          <span data-numeric className="text-muted-foreground">
            {openReports.length}
          </span>
        </h2>
        {openReports.length === 0 ? (
          <EmptyState
            className="mt-4"
            size="compact"
            title="Nothing to look at."
            body="New reports show up here."
          />
        ) : (
          <ul className="mt-4 grid gap-3">
            {openReports.map((report) => (
              <li key={report.id}>
                <ReportCard report={report} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {closedReports.length > 0 ? (
        <section aria-labelledby="closed-heading" className="mt-12">
          <h2
            id="closed-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Recently handled
          </h2>
          <ul className="mt-4 grid gap-3">
            {closedReports.map((report) => (
              <li key={report.id}>
                <ReportCard report={report} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
