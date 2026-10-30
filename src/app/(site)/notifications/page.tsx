import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RelativeTime } from "@/components/common/relative-time";
import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/empty-state";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false },
};

type Row = {
  id: string;
  kind: Database["public"]["Enums"]["notification_kind"];
  read_at: string | null;
  created_at: string;
  actor: {
    handle: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  track: { slug: string; title: string } | null;
  comment: { time_ms: number | null } | null;
};

const VERBS: Record<Row["kind"], string> = {
  comment: "commented on",
  reply: "replied to your comment on",
  helpful: "marked your comment as Helpful on",
};

export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/notifications");
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select(
      "id, kind, read_at, created_at, actor:profiles!notifications_actor_id_fkey(handle, display_name, avatar_url), track:tracks!notifications_track_id_fkey(slug, title), comment:comments!notifications_comment_id_fkey(time_ms)",
    )
    .eq("user_id", viewer.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Notifications
      </h1>
      {viewer.unread > 0 ? <MarkRead /> : null}
      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Nothing yet."
          body="You'll see it here when someone comments on your track or marks your comment as Helpful."
        />
      ) : (
        <ul className="mt-6 divide-y rounded-xl border">
          {rows.map((n) => {
            const at =
              n.comment?.time_ms != null
                ? `?t=${Math.floor(n.comment.time_ms / 1000)}`
                : "";
            return (
              <li
                key={n.id}
                className={cn(
                  "flex gap-3 px-4 py-3 text-sm",
                  !n.read_at && "bg-primary-soft/40",
                )}
              >
                {n.actor ? (
                  <UserAvatar profile={n.actor} size="sm" className="mt-0.5" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-semibold">
                      {n.actor ? displayNameOf(n.actor) : "Someone"}
                    </span>{" "}
                    {VERBS[n.kind]}{" "}
                    {n.track ? (
                      <Link
                        href={`/t/${n.track.slug}${at}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {n.track.title}
                      </Link>
                    ) : (
                      "a removed track"
                    )}
                    {n.comment?.time_ms != null
                      ? ` at ${formatTime(n.comment.time_ms)}`
                      : ""}
                    {!n.read_at ? (
                      <span className="sr-only"> (new)</span>
                    ) : null}
                  </p>
                  <RelativeTime
                    date={n.created_at}
                    className="text-xs text-muted-foreground"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
