"use client";

import { useId, useImperativeHandle, useRef, useState } from "react";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABELS } from "@/config/labels";
import { COMMENT_MAX } from "@/config/limits";
import { formatSpan, formatTime, parseTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { CommentCategory } from "@/types/view";

export type CommentDraft = {
  body: string;
  category: CommentCategory;
  /** Null when the comment is about the whole track. */
  timeMs: number | null;
  /** Set when the comment is about a range picked in the waveform. */
  endMs?: number | null;
};

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: "rate_limited" | "failed" | "unavailable" };

type ComposerError =
  "empty" | "too_long" | "rate_limited" | "failed" | "unavailable";

export type CommentComposerHandle = {
  /** Pin the comment to a second and focus the text box (the C shortcut). */
  focusAt: (ms: number) => void;
};

const CATEGORY_ORDER: CommentCategory[] = [
  "vibe",
  "mix",
  "arrangement",
  "vocals",
  "sound_design",
];

export function CommentComposer({
  currentTimeMs,
  durationMs,
  signedIn,
  onSubmit,
  onSignIn,
  maxLength = COMMENT_MAX,
  commentsPerHour = 20,
  initialBody = "",
  initialDraft,
  initialError,
  range = null,
  onClearRange,
  avatar,
  ref,
  className,
}: {
  /** Player position. The time follows it until the person starts writing. */
  currentTimeMs: number;
  durationMs: number;
  signedIn: boolean;
  onSubmit: (draft: CommentDraft) => Promise<SubmitResult>;
  onSignIn?: () => void;
  maxLength?: number;
  /** Shown in the rate limit message. */
  commentsPerHour?: number;
  initialBody?: string;
  /** A kept draft coming back: its category and its time. */
  initialDraft?: Pick<CommentDraft, "category" | "timeMs">;
  initialError?: ComposerError;
  /** A range picked in the waveform. Replaces the single time while set. */
  range?: { startMs: number; endMs: number } | null;
  onClearRange?: () => void;
  /** The writer's picture, beside the box. */
  avatar?: React.ReactNode;
  ref?: React.Ref<CommentComposerHandle>;
  className?: string;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(initialBody);
  const [category, setCategory] = useState<CommentCategory>(
    initialDraft?.category ?? "vibe",
  );
  const [wholeTrack, setWholeTrack] = useState(
    !!initialDraft && initialDraft.timeMs === null,
  );
  const [pinnedMs, setPinnedMs] = useState<number | null>(
    initialDraft?.timeMs ?? null,
  );
  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);
  const [error, setError] = useState<ComposerError | null>(
    initialError ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  // One line until it is used; then the text box and its one row of
  // choices. A kept draft comes back open.
  const [open, setOpen] = useState(!!initialBody);

  const timeMs = pinnedMs ?? Math.floor(currentTimeMs / 1000) * 1000;
  const time = formatTime(timeMs);

  useImperativeHandle(ref, () => ({
    focusAt: (ms) => {
      setWholeTrack(false);
      setPinnedMs(Math.floor(ms / 1000) * 1000);
      setOpen(true);
      textareaRef.current?.focus();
    },
  }));

  if (!signedIn) {
    // Where the box would be, the same size: a tap goes to sign in.
    return (
      <button
        type="button"
        onClick={onSignIn}
        className={cn(
          "flex h-11 w-full items-center rounded-lg border bg-card px-4 text-left text-sm text-muted-foreground focus-ring outline-none hover:text-foreground",
          className,
        )}
      >
        Sign in to comment
      </button>
    );
  }

  const errorText: Record<ComposerError, string> = {
    empty: "Write something first.",
    too_long: `Comments can be up to ${maxLength} characters.`,
    rate_limited: `You can post ${commentsPerHour} comments an hour. Try again in a bit.`,
    failed:
      "Your comment didn't go through. Your text is still here. Try again.",
    unavailable: "This track was removed or is hidden.",
  };

  async function submit() {
    if (submitting) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setError("empty");
      textareaRef.current?.focus();
      return;
    }
    if (trimmed.length > maxLength) {
      setError("too_long");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit({
        body: trimmed,
        category,
        timeMs: wholeTrack ? null : range ? range.startMs : timeMs,
        ...(range && !wholeTrack ? { endMs: range.endMs } : {}),
      });
      if (result.ok) {
        setBody("");
        setPinnedMs(null);
        setCategory("vibe");
        setWholeTrack(false);
        setOpen(false);
        if (range) onClearRange?.();
      } else {
        setError(result.error);
      }
    } catch {
      setError("failed");
    } finally {
      setSubmitting(false);
    }
  }

  function confirmTime() {
    const parsed = parseTime(timeInput);
    if (parsed === null || parsed > durationMs) {
      setTimeError(`Use m:ss, between 0:00 and ${formatTime(durationMs)}.`);
      return;
    }
    setPinnedMs(parsed);
    setTimeError(null);
    setEditingTime(false);
  }

  const remaining = maxLength - body.length;
  const showCount = remaining < maxLength * 0.2;
  const errorId = `${id}-error`;
  const countId = `${id}-count`;

  function cancel() {
    setBody("");
    setPinnedMs(null);
    setWholeTrack(false);
    setCategory("vibe");
    setError(null);
    setEditingTime(false);
    setTimeError(null);
    setOpen(false);
  }

  const where = wholeTrack
    ? "on the whole track"
    : range
      ? `from ${formatSpan(range.startMs, range.endMs)}`
      : `at ${time}`;
  const whenLabel = wholeTrack
    ? "Whole track"
    : range
      ? formatSpan(range.startMs, range.endMs)
      : `at ${time}`;
  const quiet =
    "inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] whitespace-nowrap focus-ring outline-none hover:bg-accent";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={cn(
        // The focus ring goes round the whole box, not the text inside.
        "rounded-lg border bg-card has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ring",
        className,
      )}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        {avatar ? <span className="shrink-0">{avatar}</span> : null}
        <label htmlFor={`${id}-body`} className="sr-only">
          Comment
        </label>
        <Textarea
          ref={textareaRef}
          id={`${id}-body`}
          value={body}
          rows={1}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            if (pinnedMs === null && !wholeTrack) setPinnedMs(timeMs);
            setBody(e.target.value);
            if (error === "empty" || error === "too_long") setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape" && !body) {
              e.preventDefault();
              cancel();
              textareaRef.current?.blur();
            }
          }}
          placeholder={
            open ? `What do you hear ${where}?` : `Add a comment ${where}`
          }
          aria-invalid={
            error === "empty" || error === "too_long" ? true : undefined
          }
          aria-describedby={
            [error ? errorId : null, showCount ? countId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-keyshortcuts="Meta+Enter Control+Enter"
          className={cn(
            "min-h-6 resize-none rounded-none border-0 bg-transparent p-0 py-0.5 text-[15px] focus-visible:outline-none sm:text-[15px]",
            open ? "max-h-64 min-h-16" : "h-6 overflow-hidden",
          )}
        />
      </div>

      {open ? (
        <div className={cn("pr-3 pb-3", avatar ? "pl-12" : "pl-3")}>
          <div className="flex flex-wrap items-center gap-1">
            {editingTime ? (
              <span className="flex items-center gap-1.5 px-1">
                <label
                  htmlFor={`${id}-time`}
                  className="text-[13px] text-muted-foreground"
                >
                  at
                </label>
                <Input
                  id={`${id}-time`}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={timeInput}
                  onChange={(e) => {
                    setTimeInput(e.target.value);
                    if (timeError) {
                      const parsed = parseTime(e.target.value);
                      if (parsed !== null && parsed <= durationMs)
                        setTimeError(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmTime();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingTime(false);
                      setTimeError(null);
                    }
                  }}
                  onBlur={confirmTime}
                  aria-invalid={timeError ? true : undefined}
                  aria-describedby={timeError ? `${id}-time-error` : undefined}
                  className="h-8 w-20"
                  data-numeric
                />
              </span>
            ) : (
              // The time, or the whole track, or the range from the
              // waveform: one menu.
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(quiet, "text-primary-text")}
                  >
                    <span className="sr-only">Comment</span>{" "}
                    <span data-numeric>{whenLabel}</span>
                    <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {range && !wholeTrack && onClearRange ? (
                    <DropdownMenuItem onSelect={onClearRange}>
                      At one second instead
                    </DropdownMenuItem>
                  ) : null}
                  {wholeTrack ? (
                    <DropdownMenuItem onSelect={() => setWholeTrack(false)}>
                      At {time}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() => {
                      setWholeTrack(false);
                      setTimeInput(time);
                      setEditingTime(true);
                    }}
                  >
                    Change the time
                  </DropdownMenuItem>
                  {!wholeTrack ? (
                    <DropdownMenuItem onSelect={() => setWholeTrack(true)}>
                      Whole track
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(quiet, "text-muted-foreground")}
                >
                  <span className="sr-only">Type:</span>{" "}
                  {CATEGORY_LABELS[category]}
                  <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={category}
                  onValueChange={(value) =>
                    setCategory(value as CommentCategory)
                  }
                >
                  {CATEGORY_ORDER.map((value) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {CATEGORY_LABELS[value]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancel}
              className="ml-auto text-muted-foreground"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? <Loader2Icon className="animate-spin" /> : null}
              {submitting ? "Sending…" : "Comment"}
            </Button>
          </div>
          {timeError ? (
            <p
              id={`${id}-time-error`}
              className="mt-1.5 text-xs text-destructive"
            >
              {timeError}
            </p>
          ) : null}
          {error || showCount ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 text-sm">
              {error ? (
                <p
                  id={errorId}
                  role="alert"
                  className="mr-auto text-destructive"
                >
                  {errorText[error]}
                </p>
              ) : null}
              {showCount ? (
                <span
                  id={countId}
                  data-numeric
                  className={cn(
                    "ml-auto text-xs",
                    remaining < 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {remaining} characters left
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
