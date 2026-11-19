"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { GROUP_COPY } from "@/components/groups/copy";
import { Lock } from "@/components/groups/group-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteTrackDialog } from "@/components/track/delete-track-dialog";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

export type OwnTrack = Pick<
  Tables<"tracks">,
  "id" | "slug" | "title" | "status" | "published_at"
> & {
  /** The group it is in, or null for a track in the feed. */
  group: { name: string; slug: string; isMember: boolean } | null;
};

const STATUS_LABELS: Record<OwnTrack["status"], string> = {
  live: "Live",
  hidden: "Under review",
  deleted: "Removed",
  processing: "Processing",
};

/** In a group its owner is no longer in. */
function outOfGroup(track: OwnTrack): boolean {
  return track.group !== null && !track.group.isMember;
}

export function TrackManager({ tracks }: { tracks: OwnTrack[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<OwnTrack | null>(null);

  if (tracks.length === 0)
    return (
      <EmptyState
        size="compact"
        title="You haven't uploaded anything yet."
        body="Your first track takes about two minutes."
        action={
          <Button asChild size="sm">
            <Link href="/upload">Upload a track</Link>
          </Button>
        }
      />
    );

  return (
    <>
      <ul className="divide-y rounded-xl border">
        {tracks.map((track) => (
          <li key={track.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              {/* Out of its group, a track can only be deleted, not opened. */}
              {track.status === "deleted" || outOfGroup(track) ? (
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    outOfGroup(track) && "text-muted-foreground",
                  )}
                >
                  {track.title}
                </span>
              ) : (
                <Link
                  href={`/t/${track.slug}`}
                  className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                >
                  {track.title}
                </Link>
              )}
              {/* Which group a track is in. Only its owner sees this list. */}
              {track.group ? (
                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                  <Lock className="mr-1" />
                  {track.group.name}
                  {track.group.isMember
                    ? null
                    : ` · ${GROUP_COPY.notInGroupAnymore}`}
                </span>
              ) : null}
            </div>
            {track.status !== "live" ? (
              <Badge variant="outline">{STATUS_LABELS[track.status]}</Badge>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={track.status !== "live"}
              aria-label={`Delete ${track.title}`}
              onClick={() => setConfirm(track)}
              className="touch-hit text-muted-foreground hover:text-destructive"
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      {/* Only when it applies: it says why a delete button is off. */}
      {tracks.some((t) => t.status === "hidden") ? (
        <p className="mt-2 text-xs text-muted-foreground">
          You can delete a track under review once a moderator has looked at it.
        </p>
      ) : null}
      <DeleteTrackDialog
        track={confirm}
        onClose={() => setConfirm(null)}
        onDeleted={() => {
          setConfirm(null);
          router.refresh();
        }}
      />
    </>
  );
}
