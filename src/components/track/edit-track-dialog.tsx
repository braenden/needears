"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";

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
import { DetailsFields } from "@/components/upload/details-fields";
import {
  type DetailErrors,
  type Details,
  validateDetails,
} from "@/components/upload/upload-state";
import type { Genre, Track } from "@/types/view";
import { focusFirstInvalid } from "@/lib/forms/focus-invalid";

export type EditTrackResult = { ok: true } | { ok: false };

export function detailsOf(track: Track): Details {
  return {
    title: track.title,
    genre: track.genre.slug,
    tags: track.tags.join(", "),
    description: track.description,
    feedbackWants: track.feedback_wants,
    level: track.level,
    reference: track.reference_url ?? "",
  };
}

/** The owner changes what they wrote at upload. The audio stays the same. */
export function EditTrackDialog({
  track,
  genres,
  open,
  onOpenChange,
  onSave,
}: {
  track: Track;
  genres: Genre[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (details: Details) => Promise<EditTrackResult>;
}) {
  const [details, setDetails] = useState(() => detailsOf(track));
  const [errors, setErrors] = useState<DetailErrors>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Start from what is on the page each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDetails(detailsOf(track));
      setErrors({});
      setFailed(false);
    }
  }

  function edit(next: Partial<Details>) {
    setDetails((current) => ({ ...current, ...next }));
    setErrors((current) => {
      const rest = { ...current };
      for (const key of Object.keys(next))
        delete rest[key as keyof DetailErrors];
      return rest;
    });
  }

  async function save() {
    const found = validateDetails(details);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFailed(false);
    setSaving(true);
    try {
      const result = await onSave(details);
      if (result.ok) onOpenChange(false);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="@container max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            void save().finally(() => focusFirstInvalid(form));
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
            <DialogDescription>
              Comments stay as they are, and so does the link.
            </DialogDescription>
          </DialogHeader>
          <DetailsFields
            details={details}
            errors={errors}
            genres={genres}
            onEdit={edit}
          />
          {failed ? (
            <p role="alert" className="text-sm text-destructive">
              Couldn&apos;t save your changes. Try again, or come back in a
              minute.
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2Icon className="animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
