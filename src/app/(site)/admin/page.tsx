import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { ClosedReportCard } from "./closed-report-card";
import { type AdminReport, ReportCard } from "./report-card";
import { Page, PageTitle } from "@/components/shell/page";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
};

const REPORT_COLUMNS = `id, reason, details, reported_text, status, created_at, target_type,
  reporter:profiles!reports_reporter_id_fkey(handle),
  track:tracks!reports_track_id_fkey(id, slug, title, description, status,
    owner:profiles!tracks_owner_id_fkey(id, handle, banned_at),
    group:groups!tracks_group_id_fkey(name)),
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
  // Reports about tracks in groups: the reports above leave out
  // what is not open to this admin, so these say what to open.
  const { data: closedGroupRows } = await supabase.rpc("admin_closed_reports");
  const closedGroup = closedGroupRows ?? [];
  const openedUntil = new Map(
    closedGroup.flatMap((r) =>
      r.opened_until ? [[r.report_id, r.opened_until] as const] : [],
    ),
  );
  const toOpen = closedGroup.filter(
    (r) =>
      r.status === "open" &&
      !r.opened_until &&
      !r.removed_by_group_owner &&
      r.track_id,
  );
  // Settled without us: the group's owner removed what was reported.
  const settledInGroup = closedGroup.filter((r) => r.removed_by_group_owner);

  return (
    <Page width="narrow">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle>Admin</PageTitle>
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
            {openReports.length + toOpen.length}
          </span>
        </h2>
        {openReports.length === 0 && toOpen.length === 0 ? (
          <EmptyState
            className="mt-4"
            size="compact"
            title="Nothing to look at."
            body="New reports show up here."
          />
        ) : (
          <ul className="mt-4 grid gap-3">
            {toOpen.map((report) => (
              <li key={report.report_id}>
                <ClosedReportCard report={report} />
              </li>
            ))}
            {openReports.map((report) => (
              <li key={report.id}>
                <ReportCard
                  report={report}
                  openedUntil={openedUntil.get(report.id) ?? null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {closedReports.length > 0 || settledInGroup.length > 0 ? (
        <section aria-labelledby="closed-heading" className="mt-12">
          <h2
            id="closed-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Recently handled
          </h2>
          <ul className="mt-4 grid gap-3">
            {settledInGroup.map((report) => (
              <li key={report.report_id}>
                <ClosedReportCard report={report} settled />
              </li>
            ))}
            {closedReports.map((report) => (
              <li key={report.id}>
                <ReportCard report={report} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Page>
  );
}
