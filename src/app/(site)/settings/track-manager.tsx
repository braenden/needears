"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [deleting, setDeleting] = useState(false);

  async function remove(track: OwnTrack) {
    setDeleting(true);
    const response = await fetch(`/api/tracks/${track.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setDeleting(false);
    if (response?.status === 204) {
      setConfirm(null);
      toast.success(`"${track.title}" is deleted.`);
      router.refresh();
      return;
    }
    toast.error(
      response?.status === 403
        ? "This track is under review and cannot be deleted now."
        : "Something broke on our side. Try again, or come back in a minute.",
    );
  }

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
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this track?</DialogTitle>
            <DialogDescription>
              &ldquo;{confirm?.title}&rdquo; and all its comments and reactions
              are deleted for good. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => confirm && void remove(confirm)}
            >
              {deleting ? (
                <Loader2Icon className="motion-safe:animate-spin" />
              ) : null}
              Delete track
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
