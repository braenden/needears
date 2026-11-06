"use client";

import { useEffect, useRef, useState } from "react";

import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { CATEGORY_LABELS } from "@/config/labels";
import { formatSpan } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Comment, RangeComment, VersionedComment } from "@/types/view";

const LONG_PRESS_MS = 450;
/** Markers closer than this share one button. */
const MIN_GAP_PX = 24;
/** Above this many, a density stripe shows where the comments bunch up. */
const STRIPE_FROM = 30;
const STRIPE_BINS = 60;

function excerpt(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Room kept between a preview and the edge of the screen. */
const EDGE_PX = 8;
/** The preview's width (w-64), or the screen less its edges. */
const PREVIEW_PX = 256;

/**
 * How far to move a preview sideways from the middle of its marker, so it
 * stays on screen. Worked out from the marker before the preview shows:
 * measuring the preview itself would let it stick out for a moment, which
 * on a phone widens the whole page.
 */
function previewShift(marker: HTMLElement) {
  const box = marker.getBoundingClientRect();
  const middle = box.left + box.width / 2;
  const screen = document.documentElement.clientWidth;
  const half = Math.min(PREVIEW_PX, screen - 2 * EDGE_PX) / 2;
  if (middle + half > screen - EDGE_PX) return screen - EDGE_PX - half - middle;
  if (middle - half < EDGE_PX) return EDGE_PX + half - middle;
  return 0;
}

/** A comment's preview above its marker, moved sideways by `shift`. */
function MarkerPreview({
  id,
  shift,
  children,
}: {
  id: string;
  shift: number;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="tooltip"
      className="absolute bottom-full left-1/2 mb-2 w-64 max-w-[calc(100vw-1rem)] rounded-lg bg-popover p-3 text-left text-sm text-popover-foreground shadow-pop"
      style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
    >
      {children}
    </div>
  );
}

const timeOf = (comment: Comment) =>
  formatSpan(comment.time_ms ?? 0, (comment as RangeComment).end_ms);

export type MarkerGroup<T> = {
  comments: T[];
  /** Where the group sits, 0 to 100: at its first comment. */
  left: number;
};

/**
 * Sorted comments in groups that are at least `minGap` pixels apart on a
 * row `width` pixels wide. Each comment joins the group before it when it
 * is closer than that to the previous comment.
 */
export function groupMarkers<T extends Pick<Comment, "time_ms">>(
  sorted: T[],
  durationMs: number,
  width: number,
  minGap = MIN_GAP_PX,
): MarkerGroup<T>[] {
  const groups: MarkerGroup<T>[] = [];
  let lastPx = -Infinity;
  for (const comment of sorted) {
    const left = ((comment.time_ms ?? 0) / durationMs) * 100;
    const px = (left / 100) * width;
    const current = groups.at(-1);
    if (current && px - lastPx < minGap) current.comments.push(comment);
    else groups.push({ comments: [comment], left });
    lastPx = px;
  }
  return groups;
}

/** How many comments fall in each slice of the track, for the stripe. */
function density(sorted: Pick<Comment, "time_ms">[], durationMs: number) {
  const bins = new Array<number>(STRIPE_BINS).fill(0);
  for (const comment of sorted) {
    const bin = Math.min(
      STRIPE_BINS - 1,
      Math.floor(((comment.time_ms ?? 0) / durationMs) * STRIPE_BINS),
    );
    bins[bin]! += 1;
  }
  return bins;
}

/**
 * The marker layer under the waveform: one dot per timed comment, and
 * a number where comments are too close to tell apart. Hover or focus
 * shows a comment, click jumps there; a number jumps to its first comment
 * and lists them all. On touch, tap jumps and a long press shows the
 * comment. One tab stop for the whole row; arrow keys move between markers
 * (roving tabindex), so a busy track is not 50 tab stops.
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
  const row = useRef<HTMLDivElement>(null);
  // Until measured, a phone's width: grouping too much is better than
  // a row of markers on top of each other.
  const [width, setWidth] = useState(260);
  const groups = groupMarkers(sorted, durationMs, width);
  const [focusIndex, setFocusIndex] = useState(0);
  const [preview, setPreview] = useState<{ id: string; shift: number } | null>(
    null,
  );
  const previewId = preview?.id ?? null;
  const showPreview = (id: string, marker: HTMLElement) =>
    setPreview({ id, shift: previewShift(marker) });
  const hidePreview = () => setPreview(null);
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    const element = row.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0) setWidth(element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const move = (index: number) => {
    const next = (index + groups.length) % groups.length;
    setFocusIndex(next);
    buttons.current[next]?.focus();
  };

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const versionNote = (comment: VersionedComment) => {
    const otherVersion =
      !!currentVersionId &&
      !!comment.version_id &&
      comment.version_id !== currentVersionId;
    const versionNo = comment.version_id
      ? versionNumbers?.[comment.version_id]
      : undefined;
    return { otherVersion, versionNo };
  };

  const bins = sorted.length > STRIPE_FROM ? density(sorted, durationMs) : null;
  const most = bins ? Math.max(...bins) : 0;

  return (
    <div
      ref={row}
      role="group"
      aria-label="Comment markers"
      className="relative mt-1 h-6"
      onKeyDown={(event) => {
        const keys: Record<string, number> = {
          ArrowLeft: focusIndex - 1,
          ArrowRight: focusIndex + 1,
          Home: 0,
          End: groups.length - 1,
        };
        const target = keys[event.key];
        if (target === undefined || event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        move(target);
      }}
    >
      {bins ? (
        // Brighter where more comments are.
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 flex h-1.5 -translate-y-1/2 overflow-hidden rounded-full"
        >
          {bins.map((count, i) => (
            <span
              key={i}
              className="flex-1 bg-primary"
              style={{ opacity: count ? 0.15 + 0.6 * (count / most) : 0 }}
            />
          ))}
        </div>
      ) : null}
      {sorted.map((comment) => {
        const end = (comment as RangeComment).end_ms;
        const start = comment.time_ms ?? 0;
        if (end == null || end <= start) return null;
        // Range comments get a bar under the dots from start to end.
        return (
          <span
            key={`span-${comment.id}`}
            aria-hidden="true"
            className={cn(
              // Thin, in the dots' tone: a span of time, not a scrollbar.
              "absolute bottom-0.5 h-0.5 rounded-full",
              comment.id === activeCommentId || comment.id === previewId
                ? "bg-primary-text"
                : "bg-muted-foreground/50",
            )}
            style={{
              left: `${(start / durationMs) * 100}%`,
              width: `${((end - start) / durationMs) * 100}%`,
            }}
          />
        );
      })}
      {groups.map((group, index) => {
        const first = group.comments[0]!;
        const left = group.left;
        const placeClass = cn(
          "absolute top-0 -translate-x-1/2 motion-safe:animate-marker-in",
        );

        if (group.comments.length > 1) {
          const active = group.comments.some((c) => c.id === activeCommentId);
          const label = `${group.comments.length} comments from ${timeOf(first)}`;
          return (
            <Popover
              key={`group-${first.id}`}
              open={openGroup === index}
              onOpenChange={(open) => setOpenGroup(open ? index : null)}
            >
              <PopoverAnchor asChild>
                <div
                  className={cn(placeClass, active && "z-10")}
                  style={{
                    left: `${left}%`,
                    animationDelay: `${index * 40}ms`,
                  }}
                >
                  <button
                    ref={(el) => {
                      buttons.current[index] = el;
                    }}
                    type="button"
                    tabIndex={index === focusIndex ? 0 : -1}
                    aria-haspopup="dialog"
                    aria-expanded={openGroup === index}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      setFocusIndex(index);
                      onSelect(first);
                      setOpenGroup(openGroup === index ? null : index);
                    }}
                    className="touch-hit relative grid size-6 place-items-center rounded-full focus-ring outline-none"
                  >
                    {/* Several close together: a slightly bigger dot. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 rounded-full bg-muted-foreground",
                        active && "bg-primary-text",
                      )}
                    />
                    <span className="sr-only">{label}</span>
                  </button>
                </div>
              </PopoverAnchor>
              <PopoverContent
                side="top"
                aria-label={label}
                className="w-72 max-w-[85vw] bg-popover p-1 text-sm text-popover-foreground"
              >
                <ul className="grid max-h-72 grid-cols-[minmax(0,1fr)] overflow-y-auto">
                  {group.comments.map((comment) => {
                    const { otherVersion, versionNo } = versionNote(comment);
                    return (
                      <li key={comment.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(comment);
                            setOpenGroup(null);
                          }}
                          className="flex w-full gap-2.5 rounded-md p-2 text-left focus-ring outline-none hover:bg-accent"
                        >
                          <UserAvatar profile={comment.author} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
                              <span className="min-w-0 truncate font-medium text-foreground">
                                {displayNameOf(comment.author)}
                              </span>
                              <span data-numeric className="shrink-0">
                                {timeOf(comment)}
                              </span>
                              {otherVersion && versionNo ? (
                                <span className="shrink-0">
                                  on v{versionNo}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block leading-snug">
                              {excerpt(comment.body, 70)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </PopoverContent>
            </Popover>
          );
        }

        const comment = first;
        const active = comment.id === activeCommentId;
        const previewing = comment.id === previewId;
        const name = displayNameOf(comment.author);
        const time = timeOf(comment);
        const previewIdAttr = `marker-preview-${comment.id}`;
        // Comments from another version stay visible but step back.
        const { otherVersion, versionNo } = versionNote(comment);
        const onVersion = otherVersion && versionNo ? `, on v${versionNo}` : "";
        return (
          <div
            key={comment.id}
            className={cn(placeClass, (previewing || active) && "z-10")}
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
                if (e.pointerType === "mouse")
                  showPreview(comment.id, e.currentTarget);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") hidePreview();
              }}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse") return;
                longPressed.current = false;
                const marker = e.currentTarget;
                pressTimer.current = setTimeout(() => {
                  longPressed.current = true;
                  showPreview(comment.id, marker);
                }, LONG_PRESS_MS);
              }}
              onPointerUp={clearPress}
              onPointerCancel={() => {
                clearPress();
                hidePreview();
              }}
              onContextMenu={(e) => e.preventDefault()}
              onFocus={(e) => showPreview(comment.id, e.currentTarget)}
              onBlur={hidePreview}
              className="touch-hit relative grid size-6 place-items-center rounded-full focus-ring outline-none"
            >
              {/* A small dot. Another version's is hollow, so it steps
                  back without fading below readable contrast. */}
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full transition-transform duration-fast",
                  otherVersion && !active && !previewing
                    ? "border border-muted-foreground"
                    : "bg-muted-foreground",
                  active && "bg-primary-text",
                  (previewing || active) && "scale-150",
                )}
              />
              <span className="sr-only">{`Comment by ${name} at ${time}${onVersion}`}</span>
            </button>
            {previewing ? (
              <MarkerPreview id={previewIdAttr} shift={preview?.shift ?? 0}>
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
              </MarkerPreview>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
