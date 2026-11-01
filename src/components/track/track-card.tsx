import Link from "next/link";
import { MessageSquareIcon } from "lucide-react";

import { RelativeTime } from "@/components/common/relative-time";
import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FEEDBACK_WANT_LABELS, LEVEL_DISPLAY_LABELS } from "@/config/labels";
import { formatPlays } from "@/lib/plays";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TrackSummary as Track } from "@/types/view";

import { PlayPauseIcon } from "@/components/player/play-pause-icon";

import { MiniWaveform } from "./mini-waveform";
import { SeekWaveform } from "./seek-waveform";
import { ReactionTotal } from "./reaction-total";

export function TrackCard({
  track,
  playing = false,
  progress = 0,
  onPlay,
  onSeek,
  onCue,
  showOwner = true,
  showNeedsEars = true,
  className,
}: {
  track: Track;
  playing?: boolean;
  progress?: number;
  onPlay?: (track: Track) => void;
  /** Play from a spot (0 to 1): the waveform becomes a seek bar. */
  onSeek?: (track: Track, at: number) => void;
  /** Move the playhead (0 to 1) without playing, from the keyboard. */
  onCue?: (track: Track, at: number) => void;
  /** Off where every track is by the same person, like on a profile. */
  showOwner?: boolean;
  /** Off where every track needs ears anyway. */
  showNeedsEars?: boolean;
  className?: string;
}) {
  const owner = displayNameOf(track.owner);
  return (
    <article
      aria-labelledby={`track-${track.id}-title`}
      className={cn(
        // Not a link as a whole: the title, the name and the comment count
        // are, and the waveform plays from where it is touched.
        "@container relative rounded-xl border bg-card p-3 text-card-foreground @sm:p-4",
        className,
      )}
    >
      <div className="flex gap-3">
        <Button
          type="button"
          size="icon-lg"
          variant={playing ? "default" : "secondary"}
          onClick={() => onPlay?.(track)}
          aria-label={`${playing ? "Pause" : "Play"} ${track.title}`}
          className="shrink-0 rounded-full"
        >
          <PlayPauseIcon playing={playing} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              id={`track-${track.id}-title`}
              className="min-w-0 text-[15px] leading-snug font-semibold"
            >
              <Link
                href={`/t/${track.slug}`}
                className="line-clamp-2 rounded-xs focus-ring outline-none hover:underline hover:decoration-1 hover:underline-offset-4"
              >
                {track.title}
              </Link>
            </h3>
            {/* Until the artist marks someone's comment Helpful or three
                people have commented; then nothing. */}
            {showNeedsEars && track.needs_ears ? (
              <Badge variant="solid" className="shrink-0">
                Needs ears
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
            {/* Each dot goes with what follows it, so a line never ends
                on one. */}
            {showOwner ? (
              <Link
                href={`/u/${track.owner.handle}`}
                className="group/owner flex min-w-0 items-center gap-1.5 rounded-xs focus-ring outline-none hover:text-foreground"
              >
                <UserAvatar profile={track.owner} size="sm" />
                <span className="truncate group-hover/owner:underline">
                  {owner}
                </span>
              </Link>
            ) : null}
            <span className="flex gap-1.5">
              {showOwner ? <Dot /> : null}
              {track.genre.name}
            </span>
            {track.level ? (
              <span className="flex gap-1.5">
                <Dot />
                {LEVEL_DISPLAY_LABELS[track.level]}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* What the artist wants to hear about comes first: it is what
          helps someone pick a track to give feedback on. */}
      {track.feedback_wants.length > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Wants feedback on
          {track.feedback_wants.map((want) => (
            <Badge
              key={want}
              variant="outline"
              className="h-5 px-2 text-[11px] text-foreground"
            >
              {FEEDBACK_WANT_LABELS[want]}
            </Badge>
          ))}
        </p>
      ) : null}

      {onSeek ? (
        <SeekWaveform
          track={track}
          progress={progress}
          onSeek={(at) => onSeek(track, at)}
          onMove={(at) => (onCue ?? onSeek)(track, at)}
          onToggle={() => onPlay?.(track)}
          className="mt-3"
        />
      ) : (
        <MiniWaveform
          peaks={track.peaks}
          progress={progress}
          className="mt-3 h-10 @sm:h-12"
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <time data-numeric>{formatTime(track.duration_ms)}</time>
        {/* Comments by other people, on every version. Opens the track at
            its comments. */}
        <Link
          href={`/t/${track.slug}#comments`}
          className="touch-hit flex items-center gap-1 rounded-xs focus-ring outline-none hover:text-foreground hover:underline hover:underline-offset-4"
          data-numeric
        >
          <MessageSquareIcon className="size-3.5" aria-hidden="true" />
          {track.listener_comment_count}
          <span className="sr-only">
            {track.listener_comment_count === 1 ? "comment" : "comments"}
          </span>
        </Link>
        <ReactionTotal trackId={track.id} counts={track.reaction_counts} />
        {track.play_count > 0 ? (
          <span data-numeric>{formatPlays(track.play_count)}</span>
        ) : null}
        {track.version_count && track.version_count > 1 ? (
          <span data-numeric>{track.version_count} versions</span>
        ) : null}
        <RelativeTime date={track.published_at} className="ml-auto" />
      </div>
    </article>
  );
}

function Dot() {
  return <span aria-hidden="true">·</span>;
}

export function TrackCardSkeleton() {
  return (
    <div
      className="rounded-xl border bg-card p-4"
      role="status"
      aria-label="Loading track"
    >
      <div className="flex gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
      <Skeleton className="mt-3 h-5 w-2/3" />
      <Skeleton className="mt-3 h-12 w-full" />
      <Skeleton className="mt-3 h-3 w-1/2" />
    </div>
  );
}
