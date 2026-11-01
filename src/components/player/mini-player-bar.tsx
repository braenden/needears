"use client";

import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { PlayPauseIcon } from "./play-pause-icon";

/**
 * The track page's player in one slim line, under the header on phones
 * once the full player has scrolled away: play or pause, the time, and a
 * thin progress line with a tick for each timed comment. Tapping the line
 * goes back up to the full player. Laid over the page, so it showing up
 * moves nothing.
 */
export function MiniPlayerBar({
  title,
  visible,
  playing,
  timeMs,
  durationMs,
  markerTimes,
  onToggle,
  onExpand,
}: {
  title: string;
  visible: boolean;
  playing: boolean;
  timeMs: number;
  durationMs: number;
  /** When each timed comment is, for the ticks. */
  markerTimes: number[];
  onToggle: () => void;
  onExpand: () => void;
}) {
  const progress = durationMs ? Math.min(1, timeMs / durationMs) : 0;
  return (
    <div
      data-slot="mini-player"
      aria-hidden={!visible || undefined}
      inert={!visible || undefined}
      className={cn(
        "fixed inset-x-0 top-14 z-30 h-16 border-b bg-background transition-opacity duration-fast sm:hidden",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex h-full items-center gap-3 px-4">
        <Button
          type="button"
          size="icon-lg"
          variant={playing ? "default" : "secondary"}
          onClick={onToggle}
          aria-label={playing ? "Pause" : "Play"}
          className="shrink-0 rounded-full"
        >
          <PlayPauseIcon playing={playing} />
        </Button>
        <button
          type="button"
          onClick={onExpand}
          className="flex min-w-0 flex-1 flex-col items-start rounded-xs text-left focus-ring outline-none"
        >
          <span className="w-full truncate text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground" data-numeric>
            {formatTime(timeMs)} / {formatTime(durationMs)}
          </span>
          <span className="sr-only">Show the full player</span>
        </button>
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1 bg-muted"
      >
        <div
          className="h-full bg-primary"
          style={{ width: `${progress * 100}%` }}
        />
        {markerTimes.map((ms, i) => (
          <span
            key={i}
            className="absolute -top-0.5 h-2 w-px bg-foreground/60"
            style={{ left: `${(ms / durationMs) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
