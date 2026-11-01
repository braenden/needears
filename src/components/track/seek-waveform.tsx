"use client";

import { useRef, useState } from "react";

import { formatTime, formatTimeSpoken } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TrackSummary } from "@/types/view";

import { MiniWaveform } from "./mini-waveform";

const STEP_S = 5;
// A finger has to move this far sideways before it scrubs; less is a tap,
// and up or down is the page scrolling.
const DRAG_PX = 6;

/**
 * The card's waveform as a seek bar: click or tap a spot to play from
 * there, or drag to scrub. The arrow keys, Home and End move the playhead
 * without starting it; Space or Enter plays. Vertical swipes still scroll
 * the page.
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
  /** Play from a spot, 0 to 1: a click, a tap or a drag. */
  onSeek: (at: number) => void;
  /** Move the playhead without starting it: the keys. */
  onMove: (at: number) => void;
  /** Space or Enter: play or pause. */
  onToggle: () => void;
  className?: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; touch: boolean; dragging: boolean } | null>(
    null,
  );
  // With a mouse: where the pointer is, for a light fill and the time.
  const [hoverAt, setHoverAt] = useState<number | null>(null);
  const seconds = track.duration_ms / 1000;
  const now = Math.round(progress * seconds);

  const at = (clientX: number) => {
    const box = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  };

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
        "relative cursor-pointer touch-pan-y rounded-md focus-ring outline-none select-none",
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const touch = event.pointerType !== "mouse";
        press.current = { x: event.clientX, touch, dragging: !touch };
        event.currentTarget.setPointerCapture(event.pointerId);
        // A mouse plays at once; a finger waits to see if it is a tap.
        if (!touch) onSeek(at(event.clientX));
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") setHoverAt(at(event.clientX));
        const current = press.current;
        if (!current) return;
        if (!current.dragging) {
          if (Math.abs(event.clientX - current.x) < DRAG_PX) return;
          current.dragging = true;
        }
        onSeek(at(event.clientX));
      }}
      onPointerUp={(event) => {
        const current = press.current;
        press.current = null;
        if (current?.touch) onSeek(at(event.clientX));
      }}
      onPointerLeave={() => setHoverAt(null)}
      // The page took the gesture (a scroll): nothing to play.
      onPointerCancel={() => {
        press.current = null;
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
      {hoverAt !== null ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 rounded-l-md bg-foreground/10"
            style={{ width: `${hoverAt * 100}%` }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded-sm bg-foreground px-1.5 py-0.5 text-[11px] leading-none text-background"
            style={{
              left: `clamp(1.25rem, ${hoverAt * 100}%, calc(100% - 1.25rem))`,
            }}
            data-numeric
          >
            {formatTime(hoverAt * track.duration_ms)}
          </span>
        </>
      ) : null}
    </div>
  );
}
