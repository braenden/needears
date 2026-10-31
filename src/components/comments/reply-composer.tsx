"use client";

import { useId, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { SubmitResult } from "./comment-composer";

type ReplyError =
  "empty" | "too_long" | "rate_limited" | "failed" | "unavailable";

/**
 * Inline reply box under a top-level comment. Opens focused (the person just
 * pressed Reply), Escape or Cancel closes it, Cmd or Ctrl + Enter sends.
 */
export function ReplyComposer({
  parentName,
  onSubmit,
  onClose,
  maxLength = 1000,
  commentsPerHour = 20,
  className,
}: {
  parentName: string;
  onSubmit: (body: string) => Promise<SubmitResult>;
  /** Called on Cancel, Escape and after a reply is posted. */
  onClose: () => void;
  maxLength?: number;
  commentsPerHour?: number;
  className?: string;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<ReplyError | null>(null);
  const [sending, setSending] = useState(false);

  const errorText: Record<ReplyError, string> = {
    empty: "Write something first.",
    too_long: `Replies can be up to ${maxLength} characters.`,
    rate_limited: `Easy there. You can post ${commentsPerHour} comments per hour for now. Try again in a bit.`,
    failed: "Your reply didn't go through. Your text is still here. Try again.",
    unavailable: "This track was removed or is hidden.",
  };

  async function send() {
    if (sending) return;
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
    setSending(true);
    try {
      const result = await onSubmit(trimmed);
      if (result.ok) {
        setBody("");
        onClose();
      } else {
        setError(result.error);
      }
    } catch {
      setError("failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      noValidate
      className={cn("grid gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label htmlFor={`${id}-body`} className="sr-only">
        Reply to {parentName}
      </label>
      <Textarea
        ref={textareaRef}
        id={`${id}-body`}
        // The person just pressed Reply, so the box should take the focus.
        autoFocus
        value={body}
        placeholder={`Reply to ${parentName}`}
        onChange={(e) => {
          setBody(e.target.value);
          if (error === "empty" || error === "too_long") setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        aria-invalid={
          error === "empty" || error === "too_long" ? true : undefined
        }
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-16 bg-background"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="mr-auto min-h-5 text-sm" aria-live="polite">
          {error ? (
            <p id={`${id}-error`} className="text-destructive">
              {errorText[error]}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={sending}
          aria-keyshortcuts="Meta+Enter Control+Enter"
        >
          {sending ? (
            <Loader2Icon className="motion-safe:animate-spin" />
          ) : null}
          Reply
        </Button>
      </div>
    </form>
  );
}
