"use client";

import { LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { REACTIONS } from "@/config/labels";
import { cn } from "@/lib/utils";
import type { ReactionKind } from "@/types/view";

/**
 * Quick reactions on the whole track, plus Copy link. Lets Nora say "love
 * this" without writing a comment.
 */
export function ReactionBar({
  counts,
  mine,
  signedIn,
  onToggle,
  onSignIn,
  shareUrl,
  className,
}: {
  counts: Record<ReactionKind, number>;
  mine: ReactionKind[];
  signedIn: boolean;
  onToggle?: (kind: ReactionKind, on: boolean) => void;
  onSignIn?: () => void;
  /** When set, a Copy link button is shown. */
  shareUrl?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div
        role="group"
        aria-label="React to this track"
        className="flex flex-wrap gap-1.5"
      >
        {REACTIONS.map(({ kind, emoji, label }) => {
          const pressed = mine.includes(kind);
          const count = counts[kind];
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={pressed}
              aria-label={`${label}, ${count}`}
              onClick={() =>
                signedIn ? onToggle?.(kind, !pressed) : onSignIn?.()
              }
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-[background-color,border-color,transform] duration-(--duration-fast) outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                pressed
                  ? "border-transparent bg-primary-soft text-primary-text"
                  : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {emoji}
              </span>
              <span data-numeric className="min-w-[1ch] font-medium">
                {count}
              </span>
            </button>
          );
        })}
      </div>
      {shareUrl ? (
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareUrl);
              toast.success("Link copied.");
            } catch {
              toast.error(
                "Couldn't copy the link. Copy it from the address bar instead.",
              );
            }
          }}
        >
          <LinkIcon />
          Copy link
        </Button>
      ) : null}
    </div>
  );
}
