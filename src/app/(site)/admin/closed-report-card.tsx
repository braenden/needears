"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { RelativeTime } from "@/components/common/relative-time";
import { GROUP_COPY } from "@/components/groups/copy";
import { Lock } from "@/components/groups/group-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { REPORT_REASON_LABELS } from "@/config/labels";
import type { Database } from "@/types/database";
import { openClosedForReport } from "./actions";

type ClosedReport =
  Database["public"]["Functions"]["admin_closed_reports"]["Returns"][number];

/**
 * A report about something in a group, before it is opened: what
 * the report says, but not the track or the comment. Opening it is the
 * logged way in.
 */
export function ClosedReportCard({
  report,
  settled = false,
}: {
  report: ClosedReport;
  /** The group's owner removed what was reported: nothing left to open. */
  settled?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      const result = await openClosedForReport(
        report.track_id,
        report.report_id,
      );
      if (!result.ok) toast.error(result.message);
    });
  }

  return (
    <article
      aria-label={`Report about a ${report.target_type} in a group`}
      className="rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{REPORT_REASON_LABELS[report.reason]}</Badge>
        <span className="text-muted-foreground">
          {report.target_type} reported
        </span>
        <RelativeTime
          date={report.created_at}
          className="text-muted-foreground"
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        <Lock className="mr-1.5" />
        {settled ? GROUP_COPY.adminRemovedByOwner : GROUP_COPY.adminInGroup}
      </p>
      {settled ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={open}
            disabled={pending}
          >
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            {GROUP_COPY.adminOpenForReport}
          </Button>
          <p className="text-sm text-muted-foreground">
            {GROUP_COPY.adminOpenNote}
          </p>
        </div>
      )}
    </article>
  );
}
