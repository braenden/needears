import Link from "next/link";
import { MessageSquareIcon } from "lucide-react";

import { displayNameOf } from "@/components/common/user-avatar";
import { PlayPauseIcon } from "@/components/player/play-pause-icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FEEDBACK_WANT_LABELS } from "@/config/labels";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TrackSummary as Track } from "@/types/view";

import { SeekWaveform } from "./seek-waveform";

/** "mix, arrangement and vocals". */
function listOf(words: string[]) {
  return words.length > 1
    ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
    : (words[0] ?? "");
}

/**
 * The quiet line under a track's name: the artist's own words, or else
 * what they want feedback on. Empty when there is neither.
 */
export function trackNote(
  track: Pick<Track, "description" | "feedback_wants">,
) {
  const note = track.description?.replace(/\s+/g, " ").trim();
  if (note) return note;
  if (track.feedback_wants.length === 0) return "";
  return `Wants feedback on ${listOf(
    track.feedback_wants.map((want) =>
      FEEDBACK_WANT_LABELS[want].toLowerCase(),
    ),
  )}`;
}

const GRID =
  "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-4 md:grid-cols-[auto_minmax(0,22rem)_minmax(0,1fr)_auto] md:gap-x-6 md:py-5";

/**
 * A track as a row in a list, like a song in a music app: play, the name
 * with one grey line and the artist's note, and the waveform, which plays
 * from where it is clicked. On wide screens the waveform sits in the
 * middle with the comment count and length on the right; on phones it
 * goes under the text and the count joins the grey line.
 */
export function TrackRow({
  track,
  playing = false,
  progress = 0,
  onPlay,
  onSeek,
  onCue,
  showOwner = true,
}: {
  track: Track;
  playing?: boolean;
  progress?: number;
  onPlay?: (track: Track) => void;
  /** Play from a spot (0 to 1). */
  onSeek?: (track: Track, at: number) => void;
  /** Move the playhead (0 to 1) without playing, from the keyboard. */
  onCue?: (track: Track, at: number) => void;
  /** Off where every track is by the same person, like on a profile. */
  showOwner?: boolean;
}) {
  const comments = track.listener_comment_count;
  return (
    <article aria-labelledby={`track-${track.id}-title`} className={GRID}>
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
      <div className="min-w-0">
        <h3
          id={`track-${track.id}-title`}
          className="text-base leading-snug font-semibold"
        >
          <Link
            href={`/t/${track.slug}`}
            className="block truncate rounded-xs focus-ring outline-none hover:underline hover:decoration-1 hover:underline-offset-4"
          >
            {track.title}
          </Link>
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {showOwner ? (
            <>
              <Link
                href={`/u/${track.owner.handle}`}
                className="rounded-xs focus-ring outline-none hover:text-foreground hover:underline hover:underline-offset-4"
              >
                {displayNameOf(track.owner)}
              </Link>
              {" · "}
            </>
          ) : null}
          {track.genre.name}
          {/* On a phone the count sits here, so the note gets the width. */}
          <span className="md:hidden">
            {" · "}
            <Link
              href={`/t/${track.slug}#comments`}
              className="touch-hit rounded-xs focus-ring outline-none hover:text-foreground"
            >
              <MessageSquareIcon
                className="inline size-3.5 -translate-y-px"
                aria-hidden="true"
              />{" "}
              <span data-numeric>{comments}</span>
              <span className="sr-only">
                {comments === 1 ? " comment" : " comments"}
              </span>
            </Link>
          </span>
        </p>
        {/* Held open when empty, so every row is as tall. */}
        <p className="mt-1.5 min-h-5 truncate text-sm text-muted-foreground">
          {trackNote(track)}
        </p>
      </div>
      {onSeek ? (
        <SeekWaveform
          track={track}
          progress={progress}
          onSeek={(at) => onSeek(track, at)}
          onMove={(at) => (onCue ?? onSeek)(track, at)}
          onToggle={() => onPlay?.(track)}
          barsClassName="h-9 md:h-12"
          className="col-span-2 col-start-1 row-start-2 md:col-span-1 md:col-start-auto md:row-start-auto"
        />
      ) : null}
      <Link
        href={`/t/${track.slug}#comments`}
        className="hidden items-center gap-4 rounded-xs text-[13px] text-muted-foreground focus-ring outline-none hover:text-foreground md:flex"
      >
        <span className="flex items-center gap-1" data-numeric>
          <MessageSquareIcon className="size-3.5" aria-hidden="true" />
          {comments}
          <span className="sr-only">
            {comments === 1 ? " comment," : " comments,"}
          </span>
        </span>
        <span className="w-10 text-right" data-numeric>
          {formatTime(track.duration_ms)}
          <span className="sr-only"> long</span>
        </span>
      </Link>
    </article>
  );
}

/**
 * A track in a short side list: a small play button, the title (to the
 * track) and the artist. Nothing else.
 */
export function CompactTrackRow({
  track,
  playing = false,
  onPlay,
}: {
  track: Track;
  playing?: boolean;
  onPlay?: (track: Track) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Button
        type="button"
        size="icon-sm"
        variant={playing ? "default" : "secondary"}
        onClick={() => onPlay?.(track)}
        aria-label={`${playing ? "Pause" : "Play"} ${track.title}`}
        className="touch-hit size-8 shrink-0 rounded-full [&_svg]:size-3.5"
      >
        <PlayPauseIcon playing={playing} />
      </Button>
      <div className="min-w-0 flex-1">
        <Link
          href={`/t/${track.slug}`}
          className="block truncate rounded-xs text-sm font-medium focus-ring outline-none hover:underline hover:underline-offset-4"
        >
          {track.title}
        </Link>
        <p className="truncate text-[13px] text-muted-foreground">
          {displayNameOf(track.owner)}
        </p>
      </div>
    </div>
  );
}

export function TrackRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(GRID, className)}
      role="status"
      aria-label="Loading track"
    >
      <Skeleton className="size-11 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <Skeleton className="col-span-2 col-start-1 row-start-2 h-9 md:col-span-1 md:col-start-auto md:row-start-auto md:h-12" />
      <Skeleton className="hidden h-3 w-20 md:block" />
    </div>
  );
}
