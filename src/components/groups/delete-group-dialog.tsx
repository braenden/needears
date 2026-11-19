"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { GROUP_COPY } from "./copy";

/**
 * The owner deletes the group, with every track in it, for everyone. The
 * name has to be typed first, since it deletes other people's tracks.
 */
export function DeleteGroupDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: { id: string; name: string };
}) {
  const id = useId();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = typed.trim() === group.name;

  async function remove() {
    setDeleting(true);
    const response = await fetch(`/api/groups/${group.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setDeleting(false);
    if (response?.status === 204) {
      toast.success(GROUP_COPY.groupDeleted(group.name));
      router.push("/groups");
      return;
    }
    toast.error(GROUP_COPY.broke);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{GROUP_COPY.deleteGroupTitle(group.name)}</DialogTitle>
          <DialogDescription>{GROUP_COPY.deleteGroupBody}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches) void remove();
          }}
        >
          <label htmlFor={`${id}-name`} className="text-sm">
            {GROUP_COPY.typeToDelete(group.name)}
          </label>
          <Input
            id={`${id}-name`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <DialogFooter className="mt-3">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              disabled={!matches || deleting}
            >
              {deleting ? <Loader2Icon className="animate-spin" /> : null}
              Delete group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
