"use client";

import { useId, useState } from "react";
import { FlagIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_REASON_LABELS } from "@/config/labels";
import { REPORT_DETAILS_MAX } from "@/config/limits";
import type { ReportReason, ReportTarget } from "@/types/view";

export type ReportResult =
  { ok: true } | { ok: false; error: "rate_limited" | "failed" };

const REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

export function ReportDialog({
  target,
  onSubmit,
  trigger,
  open,
  onOpenChange,
}: {
  target: ReportTarget;
  onSubmit: (report: {
    reason: ReportReason;
    details: string;
  }) => Promise<ReportResult>;
  /** Defaults to a small "Report" button. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  function reset(nextOpen: boolean) {
    if (!nextOpen) {
      setReason(null);
      setDetails("");
      setState("idle");
      setError(null);
    }
    onOpenChange?.(nextOpen);
  }

  async function send() {
    if (!reason) {
      setError("Pick a reason.");
      return;
    }
    setError(null);
    setState("sending");
    try {
      const result = await onSubmit({ reason, details: details.trim() });
      if (result.ok) {
        setState("sent");
        return;
      }
      setError(
        result.error === "rate_limited"
          ? "You've sent a lot of reports today. Try again tomorrow."
          : "Something broke on our side. Try again, or come back in a minute.",
      );
    } catch {
      setError(
        "Something broke on our side. Try again, or come back in a minute.",
      );
    }
    setState("idle");
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      {trigger !== null ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <FlagIcon /> Report
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent>
        {state === "sent" ? (
          <>
            <DialogHeader>
              <DialogTitle>Report sent</DialogTitle>
              <DialogDescription>
                Thanks. We&apos;ll take a look.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Close</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <DialogHeader>
              <DialogTitle>Report this {target}</DialogTitle>
              <DialogDescription>
                A person reads every report.
              </DialogDescription>
            </DialogHeader>
            <fieldset aria-describedby={error ? `${id}-error` : undefined}>
              <legend className="mb-2 text-sm font-medium">
                Why are you reporting it?
              </legend>
              <div className="grid gap-1">
                {REASONS.map((value) => (
                  <label
                    key={value}
                    className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-accent has-checked:bg-accent"
                  >
                    <input
                      type="radio"
                      name={`${id}-reason`}
                      value={value}
                      checked={reason === value}
                      onChange={() => {
                        setReason(value);
                        setError(null);
                      }}
                      className="size-4 accent-(--primary)"
                    />
                    {REPORT_REASON_LABELS[value]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-2">
              <label htmlFor={`${id}-details`} className="text-sm font-medium">
                Anything we should know?{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <Textarea
                id={`${id}-details`}
                value={details}
                maxLength={REPORT_DETAILS_MAX}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
            {error ? (
              <p
                id={`${id}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={state === "sending"}>
                {state === "sending" ? (
                  <Loader2Icon className="motion-safe:animate-spin" />
                ) : null}
                Send report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
