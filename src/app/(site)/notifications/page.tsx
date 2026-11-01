import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/empty-state";
import { withAvatars } from "@/lib/data/avatars";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { groupNotifications, namesText } from "@/lib/notifications/group";
import { MarkRead } from "./mark-read";
import { NotificationRow } from "./notification-row";
import { isModerationAction, ModerationNotice } from "./moderation-notice";
import {
  LISTED_NOTIFICATION_KINDS,
  type ListedNotificationKind,
} from "@/lib/data/notification-kinds";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false },
};

type Row = {
  id: string;
  kind: ListedNotificationKind;
  action: string | null;
  target: "track" | "comment" | null;
  reason: string | null;
  read_at: string | null;
  created_at: string;
  actor: {
    id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  track: { slug: string; title: string } | null;
  comment: { time_ms: number | null } | null;
};

type Kind = Exclude<ListedNotificationKind, "moderation">;

const VERBS: Record<Kind, string> = {
  comment: "commented on",
  reply: "replied to your comment on",
  helpful: "marked your comment as Helpful on",
};

// One person, several times.
const REPEATED: Record<Kind, (n: number) => string> = {
  comment: (n) => `left ${n} comments on`,
  reply: (n) => `replied ${n} times to your comments on`,
  helpful: (n) => `marked ${n} of your comments as Helpful on`,
};

// Several people.
const PLURAL: Record<Kind, string> = {
  comment: "commented on",
  reply: "replied to your comments on",
  helpful: "marked your comments as Helpful on",
};

const PAGE = 50;
const MOST = 500;

export default async function NotificationsPage({
  searchParams,
}: PageProps<"/notifications">) {
  const { show } = await searchParams;
  // How many to show: 50 more each time "Load more" is pressed.
  const count = Math.min(
    MOST,
    Math.max(PAGE, Math.ceil(Number(show) / PAGE || 1) * PAGE),
  );
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/notifications");
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select(
      "id, kind, action, target, reason, read_at, created_at, actor:profiles!notifications_actor_id_fkey(id, handle, display_name, avatar_url, avatar_key), track:tracks!notifications_track_id_fkey(slug, title), comment:comments!notifications_comment_id_fkey(time_ms)",
    )
    .eq("user_id", viewer.userId)
    .in("kind", [...LISTED_NOTIFICATION_KINDS])
    .order("created_at", { ascending: false })
    .limit(count + 1);
  const hasMore = (data?.length ?? 0) > count;
  const raw = (data ?? []).slice(0, count) as unknown as (Omit<Row, "actor"> & {
    actor: (NonNullable<Row["actor"]> & { avatar_key: string | null }) | null;
  })[];
  const actors = await withAvatars(
    supabase,
    raw.flatMap((n) => (n.actor ? [n.actor] : [])),
  );
  const byId = new Map(actors.map((a) => [a.id, a]));
  const rows: Row[] = raw.map((n) => ({
    ...n,
    actor: n.actor ? (byId.get(n.actor.id) ?? null) : null,
  }));
  const groups = groupNotifications(rows);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
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
        <>
          <ul className="mt-6 divide-y rounded-xl border">
            {groups.map(({ items, actors }) => {
              const n = items[0]!;
              const unread = items.some((item) => !item.read_at);
              const at =
                n.comment?.time_ms != null
                  ? `?t=${Math.floor(n.comment.time_ms / 1000)}`
                  : "";
              // The whole row opens the track: its link stretches over the
              // row (after:inset-0), with the hover and focus on the row.
              // A removed track has no page to open.
              const opens =
                !!n.track &&
                !(
                  n.kind === "moderation" &&
                  n.action === "removed" &&
                  n.target === "track"
                );
              const rowClass = cn(
                "relative flex gap-3 px-4 py-3 text-sm",
                opens &&
                  "hover:bg-accent/60 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-inset",
              );
              if (n.kind === "moderation") {
                if (!isModerationAction(n.action) || !n.target) return null;
                return (
                  <NotificationRow
                    key={n.id}
                    unread={unread}
                    className={rowClass}
                  >
                    <ModerationNotice
                      action={n.action}
                      target={n.target}
                      reason={n.reason}
                      track={n.track}
                      at={at}
                      createdAt={n.created_at}
                    />
                  </NotificationRow>
                );
              }
              const kind = n.kind;
              const names = actors.map((a) => displayNameOf(a));
              const verb =
                items.length === 1
                  ? VERBS[kind]
                  : actors.length <= 1
                    ? REPEATED[kind](items.length)
                    : PLURAL[kind];
              return (
                <NotificationRow
                  key={n.id}
                  unread={unread}
                  className={rowClass}
                >
                  {actors.length > 0 ? (
                    // Two at most, in a column of fixed width, so the text
                    // starts in the same place on every row.
                    <span className="mt-0.5 flex w-10 shrink-0 -space-x-2">
                      {actors.slice(0, 2).map((actor) => (
                        <UserAvatar
                          key={actor.id}
                          profile={actor}
                          size="sm"
                          className="ring-2 ring-card"
                        />
                      ))}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-semibold">{namesText(names)}</span>{" "}
                      {verb}{" "}
                      {n.track ? (
                        <Link
                          href={`/t/${n.track.slug}${at}`}
                          className="font-medium underline-offset-4 outline-none after:absolute after:inset-0 hover:underline"
                        >
                          {n.track.title}
                        </Link>
                      ) : (
                        "a removed track"
                      )}
                      {items.length === 1 && n.comment?.time_ms != null
                        ? ` at ${formatTime(n.comment.time_ms)}`
                        : ""}
                    </p>
                    <RelativeTime
                      date={n.created_at}
                      className="text-xs text-muted-foreground"
                    />
                  </div>
                </NotificationRow>
              );
            })}
          </ul>
          {hasMore && count < MOST ? (
            <div className="mt-4 flex justify-center">
              <Button asChild variant="outline">
                <Link
                  href={`/notifications?show=${count + PAGE}`}
                  scroll={false}
                >
                  Load more
                </Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
