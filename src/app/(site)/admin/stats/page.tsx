import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Stats",
  robots: { index: false },
};

// The north star target from plan part 12.
const TARGET = 0.7;

function share(hits: number, tracks: number): number | null {
  return tracks > 0 ? hits / tracks : null;
}

function percent(value: number | null): string {
  return value === null ? "No data" : `${Math.round(value * 100)}%`;
}

export default async function AdminStatsPage() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_stats").single();
  if (error || !data) throw new Error(`Stats failed: ${error?.code}`);

  const recent = share(data.north_star_30d_hits, data.north_star_30d_tracks);
  const allTime = share(data.north_star_all_hits, data.north_star_all_tracks);
  const today = [
    { label: "Uploads", value: data.tracks_today },
    { label: "Comments", value: data.comments_today },
    { label: "New users", value: data.users_today },
    { label: "Helpful marks", value: data.helpful_today },
    { label: "Reports", value: data.reports_today },
  ];
  const totals = [
    { label: "Live tracks", value: data.live_tracks },
    { label: "Live comments", value: data.live_comments },
    { label: "Users", value: data.users_total },
    { label: "Open reports", value: data.open_reports },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Stats
        </h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin">Reports</Link>
        </Button>
      </div>

      <section
        aria-labelledby="north-star-heading"
        className="mt-8 rounded-xl border bg-card p-5"
      >
        <h2
          id="north-star-heading"
          className="text-sm font-medium text-muted-foreground"
        >
          Tracks with a comment within 48 hours, last 30 days
        </h2>
        <p
          data-numeric
          className="mt-2 font-display text-5xl font-bold tracking-tight"
        >
          {percent(recent)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          <span data-numeric>{data.north_star_30d_hits}</span> of{" "}
          <span data-numeric>{data.north_star_30d_tracks}</span> tracks. Target{" "}
          <span data-numeric>{percent(TARGET)}</span>. All time{" "}
          <span data-numeric>{percent(allTime)}</span>.
        </p>
        <div
          aria-hidden="true"
          className="relative mt-4 h-2 rounded-full bg-secondary"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round((recent ?? 0) * 100)}%` }}
          />
          <div
            className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground"
            style={{ left: `${TARGET * 100}%` }}
          />
        </div>
        <p className="mt-4 text-sm">
          {data.waiting_tracks === 0 ? (
            "No track from the last 48 hours is waiting for its first comment."
          ) : (
            <>
              <span data-numeric className="font-semibold">
                {data.waiting_tracks}
              </span>{" "}
              {data.waiting_tracks === 1 ? "track" : "tracks"} from the last 48
              hours still {data.waiting_tracks === 1 ? "waits" : "wait"} for a
              first comment.{" "}
              <Link
                href="/feed?tab=needs-ears"
                className="font-medium text-primary-text underline underline-offset-2"
              >
                Needs ears
              </Link>
            </>
          )}
        </p>
      </section>

      <StatGroup
        id="today"
        title="Today"
        note="Since midnight, Oslo time."
        stats={today}
      />
      <StatGroup id="totals" title="In total" stats={totals} />
    </div>
  );
}

function StatGroup({
  id,
  title,
  note,
  stats,
}: {
  id: string;
  title: string;
  note?: string;
  stats: { label: string; value: number }[];
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-10">
      <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {note ? (
        <p className="mt-1 text-sm text-muted-foreground">{note}</p>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd data-numeric className="mt-1 text-2xl font-semibold">
              {stat.value.toLocaleString("en")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
