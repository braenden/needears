"use client";

import { useId, useRef, useState } from "react";
import { LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { REACTIONS } from "@/config/labels";
import { cn } from "@/lib/utils";
import type { ReactionKind } from "@/types/view";

/** How long a press on touch shows what a reaction means. */
const LONG_PRESS_MS = 450;
/** How long it stays once the finger is lifted (a tap elsewhere closes it). */
const TIP_AFTER_LIFT_MS = 1500;

/** Counts after someone's reaction goes from `from` to `to` (null is none). */
export function moveReaction(
  counts: Record<ReactionKind, number>,
  from: ReactionKind | null,
  to: ReactionKind | null,
): Record<ReactionKind, number> {
  if (from === to) return counts;
  const next = { ...counts };
  if (from) next[from] = Math.max(0, next[from] - 1);
  if (to) next[to] += 1;
  return next;
}

/**
 * Quick reactions on the whole track, plus Copy link. Lets Nora say "love
 * this" without writing a comment. One reaction per person: picking another
 * moves it, picking the same one again takes it back.
 */
export function ReactionBar({
  counts,
  mine,
  signedIn,
  onPick,
  onSignIn,
  shareUrl,
  actions,
  className,
}: {
  counts: Record<ReactionKind, number>;
  /** The viewer's reaction, if any. */
  mine: ReactionKind | null;
  signedIn: boolean;
  /** The reaction picked, or null when the viewer takes theirs back. */
  onPick?: (kind: ReactionKind | null) => void;
  onSignIn?: () => void;
  /** When set, a Copy link button is shown. */
  shareUrl?: string;
  /** More buttons at the end of the row, such as a menu. */
  actions?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  // The reaction just picked gives a small bounce.
  const [popped, setPopped] = useState<ReactionKind | null>(null);
  const mineLabel = REACTIONS.find((r) => r.kind === mine)?.label;
  // On touch there is no hover: a long press shows the same words, and
  // does not react.
  const [touchTip, setTouchTip] = useState<ReactionKind | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <TooltipProvider delayDuration={300}>
        <div
          role="group"
          aria-label="React to this track"
          aria-describedby={`${id}-one`}
          className="flex flex-wrap gap-1.5"
        >
          <span id={`${id}-one`} className="sr-only">
            One reaction each. Picking another one replaces yours.
          </span>
          {REACTIONS.map(({ kind, emoji, label }) => {
            const pressed = mine === kind;
            const count = counts[kind];
            // On hover: what the emoji means, and what picking it does.
            const tip = pressed
              ? `${label}: your reaction. Pick it again to take it back.`
              : mineLabel
                ? `${label}: replaces your ${mineLabel}`
                : label;
            return (
              <Popover
                key={kind}
                open={touchTip === kind}
                onOpenChange={(open) => {
                  if (!open) setTouchTip(null);
                }}
              >
                <Tooltip>
                  <PopoverAnchor asChild>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-pressed={pressed}
                        aria-label={`${label}, ${count}`}
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse") return;
                          longPressed.current = false;
                          clearPress();
                          pressTimer.current = setTimeout(() => {
                            longPressed.current = true;
                            setTouchTip(kind);
                          }, LONG_PRESS_MS);
                        }}
                        onPointerUp={() => {
                          clearPress();
                          // Long enough to read once the finger is off it.
                          if (longPressed.current) {
                            if (hideTimer.current)
                              clearTimeout(hideTimer.current);
                            hideTimer.current = setTimeout(
                              () => setTouchTip(null),
                              TIP_AFTER_LIFT_MS,
                            );
                          }
                        }}
                        onPointerCancel={clearPress}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={() => {
                          if (longPressed.current) {
                            longPressed.current = false;
                            return;
                          }
                          if (!signedIn) return onSignIn?.();
                          setPopped(pressed ? null : kind);
                          onPick?.(pressed ? null : kind);
                        }}
                        className={cn(
                          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm focus-ring transition-[background-color,border-color,transform] duration-fast outline-none select-none active:scale-95",
                          pressed
                            ? "border-transparent bg-primary-soft text-primary-text"
                            : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "text-base leading-none",
                            popped === kind &&
                              "motion-safe:animate-reaction-pop",
                          )}
                          onAnimationEnd={() => setPopped(null)}
                        >
                          {emoji}
                        </span>
                        <span data-numeric className="min-w-[1ch] font-medium">
                          {count}
                        </span>
                      </button>
                    </TooltipTrigger>
                  </PopoverAnchor>
                  <TooltipContent>{tip}</TooltipContent>
                </Tooltip>
                <PopoverContent
                  side="top"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  // Lifting the finger focuses the button: that is not leaving.
                  onFocusOutside={(e) => e.preventDefault()}
                >
                  {tip}
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </TooltipProvider>
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
      {actions}
    </div>
  );
}
