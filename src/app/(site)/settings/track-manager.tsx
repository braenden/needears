"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteTrackDialog } from "@/components/track/delete-track-dialog";
import type { Tables } from "@/types/database";

type OwnTrack = Pick<
  Tables<"tracks">,
  "id" | "slug" | "title" | "status" | "published_at"
>;

const STATUS_LABELS: Record<OwnTrack["status"], string> = {
  live: "Live",
  hidden: "Under review",
  deleted: "Removed",
  processing: "Processing",
};

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
              {track.status === "deleted" ? (
                <span className="block truncate text-sm font-medium">
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
      <p className="mt-2 text-xs text-muted-foreground">
        Tracks under review stay until a moderator has looked at them.
      </p>
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
