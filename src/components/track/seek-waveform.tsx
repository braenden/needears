"use client";

import { useRef } from "react";

import { formatTimeSpoken } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TrackSummary } from "@/types/view";

import { MiniWaveform } from "./mini-waveform";

const STEP_S = 5;

/**
 * The card's waveform as a seek bar, like SoundCloud's: click or tap a
 * spot to play from there. Nothing follows the pointer and nothing drags,
 * so a swipe over it just scrolls the page. The arrow keys, Home and End
 * move the playhead without starting it; Space or Enter plays.
 */
export function SeekWaveform({
  track,
  progress,
  onSeek,
  onMove,
  onToggle,
  className,
}: {
  track: Pick<TrackSummary, "title" | "peaks" | "duration_ms">;
  /** 0 to 1, how far the track has played. */
  progress: number;
  /** Play from a spot, 0 to 1: a click or a tap. */
  onSeek: (at: number) => void;
  /** Move the playhead without starting it: the keys. */
  onMove: (at: number) => void;
  /** Space or Enter: play or pause. */
  onToggle: () => void;
  className?: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const seconds = track.duration_ms / 1000;
  const now = Math.round(progress * seconds);

  return (
    <div
      ref={bar}
      role="slider"
      tabIndex={0}
      aria-label={`Seek in ${track.title}`}
      aria-valuemin={0}
      aria-valuemax={Math.round(seconds)}
      aria-valuenow={now}
      aria-valuetext={`${formatTimeSpoken(now * 1000)} of ${formatTimeSpoken(track.duration_ms)}`}
      className={cn(
        "cursor-pointer rounded-md focus-ring outline-none select-none",
        className,
      )}
      // A click, or a tap: a swipe that scrolls the page is not a click.
      onClick={(event) => {
        const box = bar.current!.getBoundingClientRect();
        onSeek(
          Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
        );
      }}
      onKeyDown={(event) => {
        // Like any slider: keys move, Space or Enter plays.
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onToggle();
          return;
        }
        const keys: Record<string, number> = {
          ArrowRight: now + STEP_S,
          ArrowUp: now + STEP_S,
          ArrowLeft: now - STEP_S,
          ArrowDown: now - STEP_S,
          PageUp: now + seconds / 10,
          PageDown: now - seconds / 10,
          Home: 0,
          End: seconds,
        };
        const target = keys[event.key];
        if (target === undefined) return;
        event.preventDefault();
        onMove(Math.min(1, Math.max(0, target / seconds)));
      }}
    >
      <MiniWaveform
        peaks={track.peaks}
        progress={progress}
        className="pointer-events-none h-10 @sm:h-12"
      />
    </div>
  );
}
