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

/**
 * "Delete this track?" for the owner, from Settings or the track's own
 * menu. Open while `track` is set.
 */
export function DeleteTrackDialog({
  track,
  onClose,
  onDeleted,
}: {
  track: { id: string; title: string } | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function remove(target: { id: string; title: string }) {
    setDeleting(true);
    const response = await fetch(`/api/tracks/${target.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setDeleting(false);
    if (response?.status === 204) {
      toast.success(`"${target.title}" is deleted.`);
      onDeleted();
      return;
    }
    toast.error(
      response?.status === 403
        ? "This track is under review and cannot be deleted now."
        : "Something broke on our side. Try again, or come back in a minute.",
    );
  }

  return (
    <Dialog
      open={track !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this track?</DialogTitle>
          <DialogDescription>
            &ldquo;{track?.title}&rdquo; and all its comments and reactions are
            deleted for good. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => track && void remove(track)}
          >
            {deleting ? <Loader2Icon className="animate-spin" /> : null}
            Delete track
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
