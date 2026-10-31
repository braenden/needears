import Link from "next/link";
import { ShieldIcon } from "lucide-react";

import { RelativeTime } from "@/components/common/relative-time";

import { site } from "@/config/site";
import type { ReportTarget } from "@/types/view";

export type ModerationAction =
  "hidden" | "removed" | "report_dismissed" | "report_upheld";

const ACTIONS: ModerationAction[] = [
  "hidden",
  "removed",
  "report_dismissed",
  "report_upheld",
];

export function isModerationAction(
  value: string | null,
): value is ModerationAction {
  return ACTIONS.includes(value as ModerationAction);
}

/** The sentence before the track title, for example "A moderator hid your comment on". */
export function moderationLead(
  action: ModerationAction,
  target: ReportTarget,
): string {
  const yours = target === "track" ? "your track" : "your comment on";
  const about = target === "track" ? "the track" : "a comment on";
  switch (action) {
    case "hidden":
      return `A moderator hid ${yours}`;
    case "removed":
      return `A moderator removed ${yours}`;
    case "report_dismissed":
      return `We looked at your report about ${about}`;
    case "report_upheld":
      return `We acted on your report about ${about}`;
  }
}

/** Ends the sentence after the track title. */
function moderationTail(action: ModerationAction) {
  return action === "report_dismissed" ? " and left it up." : ".";
}

/** Moderation notice: what happened, the moderator's reason, and how to appeal. */
export function ModerationNotice({
  action,
  target,
  reason,
  track,
  at,
  createdAt,
}: {
  action: ModerationAction;
  target: ReportTarget;
  reason: string | null;
  track: { slug: string; title: string } | null;
  /** "?t=12" for a comment, so the link opens at its time. */
  at: string;
  createdAt: string;
}) {
  // Removed tracks have no page to link to.
  const linkable = track && !(action === "removed" && target === "track");
  const ownPost = action === "hidden" || action === "removed";
  return (
    <>
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"
      >
        <ShieldIcon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p>
          {moderationLead(action, target)}{" "}
          {track ? (
            linkable ? (
              <Link
                href={`/t/${track.slug}${at}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {track.title}
              </Link>
            ) : (
              <span className="font-medium">{track.title}</span>
            )
          ) : (
            "a removed track"
          )}
          {moderationTail(action)}
        </p>
        {reason ? (
          <p className="mt-1.5 rounded-md bg-muted px-3 py-2 break-words whitespace-pre-line text-muted-foreground">
            <span className="font-medium text-foreground">Reason: </span>
            {reason}
          </p>
        ) : null}
        {ownPost ? (
          <p className="mt-1.5 text-muted-foreground">
            Think this is a mistake? Email{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="text-foreground underline underline-offset-4"
            >
              {site.contactEmail}
            </a>{" "}
            and tell us why.
          </p>
        ) : null}
        <RelativeTime
          date={createdAt}
          className="text-xs text-muted-foreground"
        />
      </div>
    </>
  );
}
