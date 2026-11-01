"use client";

import { useId, useImperativeHandle, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  initialError,
  range = null,
  onClearRange,
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
  initialError?: ComposerError;
  /** A range picked in the waveform. Replaces the single time while set. */
  range?: { startMs: number; endMs: number } | null;
  onClearRange?: () => void;
  ref?: React.Ref<CommentComposerHandle>;
  className?: string;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(initialBody);
  const [category, setCategory] = useState<CommentCategory>("vibe");
  const [wholeTrack, setWholeTrack] = useState(false);
  const [pinnedMs, setPinnedMs] = useState<number | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);
  const [error, setError] = useState<ComposerError | null>(
    initialError ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  const timeMs = pinnedMs ?? Math.floor(currentTimeMs / 1000) * 1000;
  const time = formatTime(timeMs);

  useImperativeHandle(ref, () => ({
    focusAt: (ms) => {
      setWholeTrack(false);
      setPinnedMs(Math.floor(ms / 1000) * 1000);
      textareaRef.current?.focus();
    },
  }));

  if (!signedIn) {
    return (
      <div
        className={cn(
          "@container flex flex-col items-start gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          Listen, then leave a comment at the exact second.
        </p>
        <Button type="button" onClick={onSignIn}>
          Sign in to comment
        </Button>
      </div>
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

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={cn(
        "@container rounded-xl border bg-card p-3 @sm:p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {!wholeTrack && range ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary-soft pr-1 pl-3 text-sm font-medium text-primary-text">
            <span>
              <span className="sr-only">Comment on </span>
              <span data-numeric>{formatSpan(range.startMs, range.endMs)}</span>
            </span>
            {onClearRange ? (
              <button
                type="button"
                onClick={onClearRange}
                aria-label="Clear range"
                className="rounded-full px-2 py-0.5 text-xs font-normal underline decoration-1 underline-offset-2 outline-none hover:bg-[color-mix(in_oklab,var(--primary-soft),var(--primary)_14%)] focus-visible:ring-2 focus-visible:ring-ring"
              >
                clear
              </button>
            ) : null}
          </span>
        ) : !wholeTrack ? (
          editingTime ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor={`${id}-time`}
                className="text-sm text-muted-foreground"
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
                onChange={(e) => setTimeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmTime();
                  }
                  if (e.key === "Escape") {
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
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTimeInput(time);
                setEditingTime(true);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-sm font-medium text-primary-text outline-none hover:bg-[color-mix(in_oklab,var(--primary-soft),var(--primary)_14%)] focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>
                <span className="sr-only">Comment </span>
                at <time data-numeric>{time}</time>
              </span>
              <span className="text-xs font-normal underline decoration-1 underline-offset-2">
                change
              </span>
            </button>
          )
        ) : null}
        <label className="touch-hit inline-flex min-h-8 cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={wholeTrack}
            onChange={(e) => setWholeTrack(e.target.checked)}
            className="size-4 accent-(--primary)"
          />
          Comment on the whole track
        </label>
      </div>
      {timeError ? (
        <p id={`${id}-time-error`} className="mt-1.5 text-xs text-destructive">
          {timeError}
        </p>
      ) : null}

      <fieldset className="mt-3">
        <legend className="sr-only">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_ORDER.map((value) => (
            <label key={value} className="relative">
              <input
                type="radio"
                name={`${id}-category`}
                value={value}
                checked={category === value}
                onChange={() => setCategory(value)}
                className="peer sr-only"
              />
              <span className="inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-(--duration-fast) select-none peer-checked:border-transparent peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:text-foreground peer-checked:hover:text-background">
                {CATEGORY_LABELS[value]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor={`${id}-body`} className="sr-only">
        Comment
      </label>
      <Textarea
        ref={textareaRef}
        id={`${id}-body`}
        value={body}
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
        }}
        placeholder={
          wholeTrack
            ? "What do you hear in this track?"
            : range
              ? `What do you hear from ${formatSpan(range.startMs, range.endMs)}?`
              : `What do you hear at ${time}?`
        }
        aria-invalid={
          error === "empty" || error === "too_long" ? true : undefined
        }
        aria-describedby={
          [error ? errorId : null, showCount ? countId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className="mt-3 max-h-64 min-h-24 bg-background"
      />

      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <div className="mr-auto min-h-5 text-sm" aria-live="polite">
          {error ? (
            <p id={errorId} className="text-destructive">
              {errorText[error]}
            </p>
          ) : null}
        </div>
        {showCount ? (
          <span
            id={countId}
            data-numeric
            className={cn(
              "text-xs",
              remaining < 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {remaining} characters left
          </span>
        ) : null}
        <span className="hidden text-xs text-muted-foreground fine:@md:inline">
          <kbd className="font-sans">Cmd</kbd> or{" "}
          <kbd className="font-sans">Ctrl</kbd> + Enter
        </span>
        <Button
          type="submit"
          disabled={submitting}
          aria-keyshortcuts="Meta+Enter Control+Enter"
        >
          {submitting ? (
            <Loader2Icon className="motion-safe:animate-spin" />
          ) : null}
          {submitting ? "Sending…" : "Comment"}
        </Button>
      </div>
    </form>
  );
}
