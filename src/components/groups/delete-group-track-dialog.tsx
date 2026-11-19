"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

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
import { GROUP_COPY } from "./copy";

/**
 * The group's owner deletes a track in the group, for everyone, also when
 * it is reported. For their own track it says what deleting your own
 * track says anywhere. Open while `track` is set.
 */
export function DeleteGroupTrackDialog({
  track,
  own = false,
  onClose,
  onDeleted,
}: {
  track: { id: string; title: string; artist: string } | null;
  /** The owner's own track. */
  own?: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  // Kept while the dialog closes, so its words stay on the way out.
  const [shown, setShown] = useState(track);
  if (track && track !== shown) setShown(track);
  const t = track ?? shown;

  async function remove() {
    if (!t) return;
    setDeleting(true);
    const response = await fetch(`/api/groups/tracks/${t.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setDeleting(false);
    if (response?.status === 204) {
      toast.success(`"${t.title}" is deleted.`);
      onDeleted();
      return;
    }
    toast.error(GROUP_COPY.broke);
  }

  return (
    <Dialog open={track !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {own
              ? "Delete this track?"
              : t
                ? GROUP_COPY.deleteTrackTitle(t.title)
                : ""}
          </DialogTitle>
          <DialogDescription>
            {own ? (
              <>
                &ldquo;{t?.title}&rdquo; and all its comments and reactions are
                deleted for good. This can&apos;t be undone.
              </>
            ) : t ? (
              GROUP_COPY.deleteTrackBody(t.artist)
            ) : (
              ""
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void remove()}
          >
            {deleting ? <Loader2Icon className="animate-spin" /> : null}
            {own ? "Delete track" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
