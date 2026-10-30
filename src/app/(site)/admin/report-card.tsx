"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { RelativeTime } from "@/components/common/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { REPORT_REASON_LABELS } from "@/config/labels";
import { formatTime } from "@/lib/time";
import type { Database } from "@/types/database";
import type { ReportReason } from "@/types/view";
import {
  type ActionResult,
  resolveReport,
  setBanned,
  setCommentStatus,
  setTrackStatus,
} from "./actions";

type Status = Database["public"]["Enums"]["track_status"];
type Person = { id: string; handle: string; banned_at: string | null };

export type AdminReport = {
  id: string;
  reason: ReportReason;
  details: string;
  // A copy of the reported text, taken when the report was filed.
  reported_text: string;
  status: Database["public"]["Enums"]["report_status"];
  created_at: string;
  target_type: "track" | "comment";
  reporter: { handle: string } | null;
  track: {
    id: string;
    slug: string;
    title: string;
    description: string;
    status: Status;
    owner: Person | null;
  } | null;
  comment: {
    id: string;
    body: string;
    status: Database["public"]["Enums"]["comment_status"];
    time_ms: number | null;
    author: Person | null;
    track: { slug: string; title: string } | null;
  } | null;
};

export function ReportCard({ report }: { report: AdminReport }) {
  const [pending, startTransition] = useTransition();

  function act(action: () => Promise<ActionResult>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(done);
      else toast.error(result.message);
    });
  }

  const person =
    report.target_type === "track"
      ? report.track?.owner
      : report.comment?.author;
  // Built like reported_text in the reports_before_insert trigger.
  const currentText =
    report.target_type === "track"
      ? [report.track?.title, report.track?.description]
          .filter(Boolean)
          .join("\n\n")
      : report.comment?.body;
  const targetStatus =
    report.target_type === "track"
      ? report.track?.status
      : report.comment?.status;
  const setStatus = (status: "live" | "hidden" | "deleted") =>
    report.target_type === "track" && report.track
      ? setTrackStatus(report.track.id, status)
      : report.comment
        ? setCommentStatus(report.comment.id, status)
        : Promise.resolve<ActionResult>({ ok: false, message: "Gone." });
  const isOpen = report.status === "open";

  return (
    <article
      aria-label={`Report about a ${report.target_type}`}
      className="rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{REPORT_REASON_LABELS[report.reason]}</Badge>
        <span className="text-muted-foreground">
          {report.target_type} reported by @{report.reporter?.handle ?? "gone"}
        </span>
        <RelativeTime
          date={report.created_at}
          className="text-muted-foreground"
        />
        {targetStatus && targetStatus !== "live" ? (
          <Badge variant="secondary">{targetStatus}</Badge>
        ) : null}
        {!isOpen ? <Badge variant="secondary">{report.status}</Badge> : null}
      </div>

      <div className="mt-3 text-sm">
        {report.track ? (
          <Link
            href={`/t/${report.track.slug}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {report.track.title}
          </Link>
        ) : null}
        {report.comment ? (
          <>
            <p className="text-muted-foreground">
              On{" "}
              {report.comment.track ? (
                <Link
                  href={`/t/${report.comment.track.slug}${report.comment.time_ms !== null ? `?t=${Math.floor(report.comment.time_ms / 1000)}` : ""}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {report.comment.track.title}
                </Link>
              ) : (
                "a removed track"
              )}
              {report.comment.time_ms !== null
                ? ` at ${formatTime(report.comment.time_ms)}`
                : ""}
            </p>
            <blockquote className="mt-2 border-l-2 pl-3 break-words whitespace-pre-line">
              {report.comment.body}
            </blockquote>
          </>
        ) : null}
        {report.reported_text && report.reported_text !== currentText ? (
          <div className="mt-2">
            <p className="text-muted-foreground">
              Edited since the report. When reported:
            </p>
            <blockquote className="mt-1 border-l-2 pl-3 break-words whitespace-pre-line">
              {report.reported_text}
            </blockquote>
          </div>
        ) : null}
        {!report.track && !report.comment ? (
          <p className="text-muted-foreground">The target was deleted.</p>
        ) : null}
        {person ? (
          <p className="mt-2 text-muted-foreground">
            By{" "}
            <Link
              href={`/u/${person.handle}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              @{person.handle}
            </Link>
            {person.banned_at ? " (banned)" : ""}
          </p>
        ) : null}
        {report.details ? (
          <p className="mt-2 rounded-md bg-muted px-3 py-2 break-words whitespace-pre-line">
            {report.details}
          </p>
        ) : null}
      </div>

      {isOpen ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {targetStatus === "live" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => act(() => setStatus("hidden"), "Hidden.")}
            >
              Hide
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !targetStatus}
              onClick={() => act(() => setStatus("live"), "Restored.")}
            >
              Restore
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || !targetStatus || targetStatus === "deleted"}
            onClick={() => act(() => setStatus("deleted"), "Removed.")}
          >
            Remove
          </Button>
          {person ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                act(
                  () => setBanned(person.id, !person.banned_at),
                  person.banned_at
                    ? "Ban lifted."
                    : `@${person.handle} is banned.`,
                )
              }
            >
              {person.banned_at ? "Lift ban" : "Ban user"}
            </Button>
          ) : null}
          <span
            className="mx-1 w-px self-stretch bg-border"
            aria-hidden="true"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              act(
                () => resolveReport(report.id, "resolved"),
                "Report resolved.",
              )
            }
          >
            Resolve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              act(
                () => resolveReport(report.id, "dismissed"),
                "Report dismissed.",
              )
            }
          >
            Dismiss
          </Button>
        </div>
      ) : null}
    </article>
  );
}
