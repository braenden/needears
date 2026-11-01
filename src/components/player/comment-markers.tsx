"use client";

import { useRef, useState } from "react";

import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { CATEGORY_LABELS } from "@/config/labels";
import { formatSpan } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Comment, RangeComment, VersionedComment } from "@/types/view";

const LONG_PRESS_MS = 450;

function excerpt(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * The marker layer under the waveform: one avatar per timed comment. Hover or
 * focus shows the comment, click jumps there. On touch, tap jumps and a long
 * press shows the comment. One tab stop for the whole row; arrow keys move
 * between markers (roving tabindex), so a busy track is not 50 tab stops.
 */
export function CommentMarkers({
  comments,
  durationMs,
  activeCommentId,
  currentVersionId,
  versionNumbers,
  onSelect,
}: {
  comments: VersionedComment[];
  durationMs: number;
  activeCommentId?: string | null;
  currentVersionId?: string;
  versionNumbers?: Record<string, number>;
  onSelect: (comment: Comment) => void;
}) {
  const sorted = [...comments].sort(
    (a, b) => (a.time_ms ?? 0) - (b.time_ms ?? 0),
  );
  const [focusIndex, setFocusIndex] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const move = (index: number) => {
    const next = (index + sorted.length) % sorted.length;
    setFocusIndex(next);
    buttons.current[next]?.focus();
  };

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return (
    <div
      role="group"
      aria-label="Comment markers"
      className="relative mt-1.5 h-7"
      onKeyDown={(event) => {
        const keys: Record<string, number> = {
          ArrowLeft: focusIndex - 1,
          ArrowRight: focusIndex + 1,
          Home: 0,
          End: sorted.length - 1,
        };
        const target = keys[event.key];
        if (target === undefined || event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        move(target);
      }}
    >
      {sorted.map((comment) => {
        const end = (comment as RangeComment).end_ms;
        const start = comment.time_ms ?? 0;
        if (end == null || end <= start) return null;
        // Range comments get a bar under the avatars from start to end.
        return (
          <span
            key={`span-${comment.id}`}
            aria-hidden="true"
            className={cn(
              "absolute bottom-0 h-1 rounded-full",
              comment.id === activeCommentId || comment.id === previewId
                ? "bg-primary-text"
                : "bg-wave",
            )}
            style={{
              left: `${(start / durationMs) * 100}%`,
              width: `${((end - start) / durationMs) * 100}%`,
            }}
          />
        );
      })}
      {sorted.map((comment, index) => {
        const left = ((comment.time_ms ?? 0) / durationMs) * 100;
        const active = comment.id === activeCommentId;
        const previewing = comment.id === previewId;
        const name = displayNameOf(comment.author);
        const time = formatSpan(
          comment.time_ms ?? 0,
          (comment as RangeComment).end_ms,
        );
        const previewIdAttr = `marker-preview-${comment.id}`;
        // Comments from another version stay visible but step back.
        const otherVersion =
          !!currentVersionId &&
          !!comment.version_id &&
          comment.version_id !== currentVersionId;
        const versionNo = comment.version_id
          ? versionNumbers?.[comment.version_id]
          : undefined;
        const onVersion = otherVersion && versionNo ? `, on v${versionNo}` : "";
        return (
          <div
            key={comment.id}
            className={cn(
              "absolute top-0 -translate-x-1/2 motion-safe:animate-marker-in",
              (previewing || active) && "z-10",
            )}
            style={{ left: `${left}%`, animationDelay: `${index * 40}ms` }}
          >
            <button
              ref={(el) => {
                buttons.current[index] = el;
              }}
              type="button"
              tabIndex={index === focusIndex ? 0 : -1}
              aria-describedby={previewing ? previewIdAttr : undefined}
              aria-current={active ? "true" : undefined}
              onClick={() => {
                if (longPressed.current) {
                  longPressed.current = false;
                  return;
                }
                setFocusIndex(index);
                onSelect(comment);
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setPreviewId(comment.id);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") setPreviewId(null);
              }}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse") return;
                longPressed.current = false;
                pressTimer.current = setTimeout(() => {
                  longPressed.current = true;
                  setPreviewId(comment.id);
                }, LONG_PRESS_MS);
              }}
              onPointerUp={clearPress}
              onPointerCancel={() => {
                clearPress();
                setPreviewId(null);
              }}
              onContextMenu={(e) => e.preventDefault()}
              onFocus={() => setPreviewId(comment.id)}
              onBlur={() => setPreviewId(null)}
              className={cn(
                "relative grid size-7 place-items-center rounded-full outline-none",
                "focus-ring",
              )}
            >
              {otherVersion && !active && !previewing ? (
                // Another version: a hollow dot instead of the avatar, so it
                // steps back without fading text below readable contrast.
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full border-2 border-wave"
                />
              ) : (
                <UserAvatar
                  profile={comment.author}
                  size="sm"
                  className={cn(
                    "size-5 ring-2 ring-card transition-transform duration-fast",
                    active && "ring-primary",
                    previewing && "scale-110",
                  )}
                />
              )}
              <span className="sr-only">{`Comment by ${name} at ${time}${onVersion}`}</span>
            </button>
            {previewing ? (
              <div
                id={previewIdAttr}
                role="tooltip"
                className={cn(
                  "absolute bottom-full mb-2 w-64 max-w-[70vw] rounded-lg bg-popover p-3 text-left text-sm text-popover-foreground shadow-pop",
                  left < 30
                    ? "left-0"
                    : left > 70
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2",
                )}
              >
                <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {name}
                  </span>
                  <span data-numeric className="shrink-0">
                    {time}
                  </span>
                  <span className="shrink-0">
                    {CATEGORY_LABELS[comment.category]}
                  </span>
                  {otherVersion && versionNo ? (
                    <span className="shrink-0">on v{versionNo}</span>
                  ) : null}
                </span>
                <span className="mt-1 block leading-snug">
                  {excerpt(comment.body)}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
