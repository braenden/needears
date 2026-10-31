"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type WaveSurfer from "wavesurfer.js";
import {
  KeyboardIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTime, formatTimeSpoken } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Comment, VersionedComment } from "@/types/view";

import { CommentMarkers } from "./comment-markers";

export type TimeRange = { startMs: number; endMs: number };

/** Shortest range worth commenting on. */
const RANGE_MIN_MS = 1000;

export type WaveformPlayerHandle = {
  seekTo: (ms: number) => void;
  play: () => void;
  pause: () => void;
};

type Status = "loading" | "ready" | "error";

export type WaveformPlayerProps = {
  title: string;
  durationMs: number;
  /** Precomputed peaks, normalised 0 to 1. Rendered at once, no decoding. */
  peaks: number[];
  /** Stream URL. Without it the waveform renders but cannot play. */
  audioUrl?: string | null;
  /** Where the playhead starts, for links like /t/slug?t=102. */
  initialTimeMs?: number;
  comments?: VersionedComment[];
  activeCommentId?: string | null;
  /**
   * Drag across the waveform, or shift + click, to pick a range to comment
   * on. I and O set its start and end at the playhead, Escape clears it.
   * A plain click still seeks.
   */
  rangeSelect?: boolean;
  range?: TimeRange | null;
  onRangeChange?: (range: TimeRange | null) => void;
  /**
   * Keep the second and keep playing when audioUrl and peaks change, for
   * switching versions (A/B). Off by default so a new track starts fresh.
   */
  keepPosition?: boolean;
  /** Markers from other versions are muted and say which version they are from. */
  currentVersionId?: string;
  /** Version id to its number, for "on v1" in marker labels. */
  versionNumbers?: Record<string, number>;
  /**
   * Turns playback down by this many dB (0 or less), to level match
   * versions in A/B. Only ever down, so nothing can clip.
   */
  gainDb?: number;
  /** Fires once per second while playing and on every seek. */
  onTimeChange?: (ms: number) => void;
  onMarkerSelect?: (comment: Comment) => void;
  /** C key: comment at the current second. */
  onCommentHere?: (ms: number) => void;
  /** "focus": shortcuts work while focus is inside the player. "global": anywhere on the page. */
  keyboardScope?: "focus" | "global";
  size?: "default" | "compact";
  /** Force a state, for /design and tests. */
  forceStatus?: Status;
  ref?: React.Ref<WaveformPlayerHandle>;
  className?: string;
};

const RANGE_SHORTCUTS: [string, string][] = [
  ["I and O", "Set the start and end of a range"],
  ["Shift plus click", "Pick a range from the playhead"],
  ["Escape", "Clear the range"],
];

const SHORTCUTS: [string, string][] = [
  ["Space", "Play or pause"],
  ["Left and right arrows", "Skip 5 s"],
  ["Shift plus arrows", "Skip 30 s"],
  ["C", "Comment here"],
  ["M", "Mute"],
  ["?", "Show this help"],
];

function readColors(el: HTMLElement) {
  const style = getComputedStyle(el);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    waveColor: get("--wave"),
    progressColor: get("--wave-progress"),
    cursorColor: get("--foreground"),
  };
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
    return true;
  return target instanceof HTMLInputElement && target.type !== "range";
}

export function WaveformPlayer({
  title,
  durationMs,
  peaks,
  audioUrl,
  initialTimeMs = 0,
  comments = [],
  activeCommentId,
  rangeSelect = false,
  range = null,
  onRangeChange,
  keepPosition = false,
  currentVersionId,
  versionNumbers,
  gainDb = 0,
  onTimeChange,
  onMarkerSelect,
  onCommentHere,
  keyboardScope = "focus",
  size = "default",
  forceStatus,
  ref,
  className,
}: WaveformPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  // Status is derived from which URL finished loading, so a new URL is
  // "loading" without resetting state in an effect.
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentMs, setCurrentMs] = useState(initialTimeMs);
  const initialTimeRef = useRef(initialTimeMs);
  const [helpOpen, setHelpOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const keepPositionRef = useRef(keepPosition);
  // Position and play state carried from the old source to the new one.
  const handoffRef = useRef<{ time: number; playing: boolean } | null>(null);
  const onTimeChangeRef = useRef(onTimeChange);
  // Read when a new source is created, so mute and level carry over.
  const mutedRef = useRef(muted);
  const volume = Math.min(1, 10 ** (Math.min(0, gainDb) / 20));
  const volumeRef = useRef(volume);
  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
    keepPositionRef.current = keepPosition;
    mutedRef.current = muted;
    volumeRef.current = volume;
  }, [onTimeChange, keepPosition, muted, volume]);
  useEffect(() => {
    wsRef.current?.setVolume(volume);
  }, [volume]);

  const status: Status = !audioUrl
    ? "ready"
    : errorUrl === audioUrl
      ? "error"
      : readyUrl === audioUrl
        ? "ready"
        : "loading";
  const shownStatus = forceStatus ?? status;
  const height = size === "compact" ? 44 : 88;
  const timed = comments.filter((c) => c.time_ms !== null);

  // Create wavesurfer on the client only, and rebuild when the source changes.
  useEffect(() => {
    const container = waveRef.current;
    const root = rootRef.current;
    if (!container || !root) return;
    let cancelled = false;
    let ws: WaveSurfer | null = null;

    void import("wavesurfer.js").then(({ default: WaveSurferLib }) => {
      if (cancelled) return;
      ws = WaveSurferLib.create({
        container,
        height,
        peaks: [peaks],
        duration: durationMs / 1000,
        url: audioUrl ?? undefined,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        cursorWidth: 2,
        dragToSeek: !rangeSelect,
        interact: !rangeSelect,
        hideScrollbar: true,
        normalize: false,
        ...readColors(root),
      });
      wsRef.current = ws;
      ws.setVolume(volumeRef.current);
      ws.setMuted(mutedRef.current);
      let lastSecond = -1;
      const report = (seconds: number) => {
        const whole = Math.floor(seconds);
        if (whole === lastSecond) return;
        lastSecond = whole;
        setCurrentMs(whole * 1000);
        onTimeChangeRef.current?.(whole * 1000);
      };
      const handoff = () => {
        const carried = handoffRef.current;
        if (!carried || !ws) return;
        handoffRef.current = null;
        ws.setTime(Math.min(carried.time, durationMs / 1000));
        if (carried.playing) void ws.play();
      };
      if (!audioUrl) handoff();
      ws.on("ready", () => {
        setReadyUrl(audioUrl ?? null);
        handoff();
        // Start where the link pointed, once.
        if (initialTimeRef.current > 0) {
          ws?.setTime(initialTimeRef.current / 1000);
          initialTimeRef.current = 0;
        }
      });
      ws.on("error", () => setErrorUrl(audioUrl ?? null));
      ws.on("play", () => setPlaying(true));
      ws.on("pause", () => setPlaying(false));
      ws.on("finish", () => setPlaying(false));
      ws.on("timeupdate", report);
      ws.on("interaction", report);
    });

    return () => {
      cancelled = true;
      if (ws && keepPositionRef.current) {
        handoffRef.current = {
          time: ws.getCurrentTime(),
          playing: ws.isPlaying(),
        };
      }
      ws?.destroy();
      wsRef.current = null;
    };
  }, [peaks, durationMs, audioUrl, height, attempt, rangeSelect]);

  // Canvas colours cannot use CSS variables, so re-read them when the theme changes.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new MutationObserver(() => {
      wsRef.current?.setOptions(readColors(root));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  const seekTo = useCallback(
    (ms: number) => {
      const clamped = Math.min(Math.max(0, ms), durationMs);
      wsRef.current?.setTime(clamped / 1000);
      const whole = Math.floor(clamped / 1000) * 1000;
      setCurrentMs(whole);
      onTimeChangeRef.current?.(whole);
    },
    [durationMs],
  );

  const togglePlay = useCallback(() => {
    if (shownStatus !== "ready") return;
    void wsRef.current?.playPause();
  }, [shownStatus]);

  const toggleMute = useCallback(() => {
    const ws = wsRef.current;
    setMuted((m) => {
      ws?.setMuted(!m);
      return !m;
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      seekTo,
      play: () => void wsRef.current?.play(),
      pause: () => wsRef.current?.pause(),
    }),
    [seekTo],
  );

  const handleKey = useCallback(
    (event: KeyboardEvent | React.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      const onButton = target instanceof HTMLButtonElement;
      const now = (wsRef.current?.getCurrentTime() ?? currentMs / 1000) * 1000;
      switch (event.key) {
        case " ":
          if (onButton) return;
          event.preventDefault();
          togglePlay();
          return;
        case "ArrowLeft":
        case "ArrowRight": {
          event.preventDefault();
          const step =
            (event.shiftKey ? 30_000 : 5_000) *
            (event.key === "ArrowLeft" ? -1 : 1);
          seekTo(now + step);
          return;
        }
        case "Home":
          event.preventDefault();
          seekTo(0);
          return;
        case "End":
          event.preventDefault();
          seekTo(durationMs);
          return;
        case "c":
        case "C":
          if (!onCommentHere) return;
          event.preventDefault();
          onCommentHere(Math.floor(now / 1000) * 1000);
          return;
        case "m":
        case "M":
          event.preventDefault();
          toggleMute();
          return;
        case "?":
          event.preventDefault();
          setHelpOpen(true);
          return;
        case "i":
        case "I":
        case "o":
        case "O": {
          if (!rangeSelect || !onRangeChange) return;
          event.preventDefault();
          const at = Math.floor(now / 1000) * 1000;
          const isStart = event.key.toLowerCase() === "i";
          const start = isStart
            ? at
            : (range?.startMs ?? Math.max(0, at - 5000));
          const end = isStart
            ? Math.max(range?.endMs ?? 0, at + RANGE_MIN_MS)
            : at;
          if (end - start < RANGE_MIN_MS) return;
          onRangeChange({ startMs: start, endMs: Math.min(end, durationMs) });
          return;
        }
        case "Escape":
          if (!range || !onRangeChange) return;
          event.preventDefault();
          onRangeChange(null);
          return;
      }
    },
    [
      currentMs,
      durationMs,
      onCommentHere,
      seekTo,
      toggleMute,
      togglePlay,
      rangeSelect,
      range,
      onRangeChange,
    ],
  );

  useEffect(() => {
    if (keyboardScope !== "global") return;
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditable(event.target)) return;
      // Inside the player the React handler already ran.
      if (rootRef.current?.contains(event.target as Node)) return;
      if (document.querySelector("[role=dialog]")) return;
      handleKey(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handleKey, keyboardScope]);

  const durationLabel = formatTime(durationMs);
  const summary = `${title}. Track, ${durationLabel}, ${comments.length} ${comments.length === 1 ? "comment" : "comments"}`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={summary}
      onKeyDown={handleKey}
      className={cn(
        "@container rounded-xl border bg-card text-card-foreground",
        size === "compact" ? "p-2" : "p-3 @sm:p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3 @sm:gap-4">
        <Button
          type="button"
          size={size === "compact" ? "icon" : "icon-lg"}
          onClick={togglePlay}
          disabled={shownStatus !== "ready"}
          aria-label={playing ? "Pause" : "Play"}
          className={cn(
            "mt-1 rounded-full disabled:opacity-100",
            size === "default" && "@sm:size-12",
            shownStatus !== "ready" && "bg-secondary text-muted-foreground",
          )}
        >
          {shownStatus === "loading" ? (
            <Loader2Icon className="motion-safe:animate-spin" />
          ) : playing ? (
            <PauseIcon className="fill-current" />
          ) : (
            <PlayIcon className="translate-x-px fill-current" />
          )}
        </Button>

        <div className="min-w-0 flex-1">
          <div
            className="relative rounded-md has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-offset-4 has-[input:focus-visible]:ring-offset-card"
            style={{ height }}
          >
            <div
              ref={waveRef}
              aria-hidden="true"
              className={cn(
                "absolute inset-0 touch-pan-y transition-opacity duration-(--duration-base)",
                shownStatus === "error" && "opacity-30",
                shownStatus === "loading" && "opacity-60",
              )}
            />
            <ActiveLine
              comments={timed}
              activeCommentId={activeCommentId}
              durationMs={durationMs}
            />
            {range ? (
              <RangeShade range={range} durationMs={durationMs} />
            ) : null}
            {rangeSelect ? (
              <RangeLayer
                durationMs={durationMs}
                playheadMs={() =>
                  (wsRef.current?.getCurrentTime() ?? currentMs / 1000) * 1000
                }
                onSeek={(ms) => {
                  onRangeChange?.(null);
                  seekTo(ms);
                }}
                onRange={(next) => onRangeChange?.(next)}
              />
            ) : null}
            <input
              type="range"
              className="sr-only"
              aria-label={`Seek in ${title}`}
              min={0}
              max={Math.floor(durationMs / 1000)}
              step={1}
              value={Math.floor(currentMs / 1000)}
              aria-valuetext={`${formatTimeSpoken(currentMs)} of ${formatTimeSpoken(durationMs)}`}
              onChange={(e) => seekTo(Number(e.target.value) * 1000)}
              disabled={shownStatus === "error"}
            />
          </div>

          {timed.length > 0 ? (
            <CommentMarkers
              comments={timed}
              durationMs={durationMs}
              activeCommentId={activeCommentId}
              currentVersionId={currentVersionId}
              versionNumbers={versionNumbers}
              onSelect={(comment) => {
                if (comment.time_ms !== null) seekTo(comment.time_ms);
                onMarkerSelect?.(comment);
              }}
            />
          ) : null}

          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            {shownStatus === "error" ? (
              <p
                role="alert"
                className="mr-auto flex items-center gap-2 text-destructive"
              >
                We couldn&apos;t load the audio.
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() => {
                    setErrorUrl(null);
                    setAttempt((a) => a + 1);
                  }}
                >
                  <RotateCcwIcon /> Try again
                </Button>
              </p>
            ) : (
              <p className="mr-auto" data-numeric>
                <time>{formatTime(currentMs)}</time>
                <span aria-hidden="true"> / </span>
                <span className="sr-only"> of </span>
                <time>{durationLabel}</time>
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label="Mute"
              className="text-muted-foreground hover:text-foreground"
            >
              {muted ? <VolumeXIcon /> : <Volume2Icon />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setHelpOpen(true)}
              aria-label="Keyboard shortcuts"
              className="hidden text-muted-foreground hover:text-foreground @sm:inline-flex"
            >
              <KeyboardIcon />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Click the player first, then use these.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5">
            {(rangeSelect ? [...SHORTCUTS, ...RANGE_SHORTCUTS] : SHORTCUTS).map(
              ([key, label]) => (
                <div key={key} className="contents">
                  <dt>
                    <kbd className="rounded-xs border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium">
                      {key}
                    </kbd>
                  </dt>
                  <dd className="text-muted-foreground">{label}</dd>
                </div>
              ),
            )}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Thin line through the waveform at the selected comment. */
function ActiveLine({
  comments,
  activeCommentId,
  durationMs,
}: {
  comments: Comment[];
  activeCommentId?: string | null;
  durationMs: number;
}) {
  const active = comments.find((c) => c.id === activeCommentId);
  if (!active || active.time_ms === null) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 w-px bg-primary-text motion-safe:animate-in motion-safe:fade-in-0"
      style={{ left: `${(active.time_ms / durationMs) * 100}%` }}
    />
  );
}

/** The picked range, shaded over the waveform, with its times on top. */
function RangeShade({
  range,
  durationMs,
}: {
  range: TimeRange;
  durationMs: number;
}) {
  const left = (range.startMs / durationMs) * 100;
  const width = ((range.endMs - range.startMs) / durationMs) * 100;
  const label = `${formatTime(range.startMs)} to ${formatTime(range.endMs)}`;
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-10 rounded-xs border-x-2 border-primary-text bg-primary/15"
        style={{ left: `${left}%`, width: `${width}%` }}
      >
        <span
          data-numeric
          className="absolute -top-1 left-1 -translate-y-full rounded-xs bg-popover px-1.5 py-0.5 text-[11px] whitespace-nowrap text-popover-foreground shadow-pop"
        >
          {label}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        Range {label} selected.
      </p>
    </>
  );
}

/**
 * Pointer layer over the waveform when ranges are on. A click seeks, a drag
 * or shift + click picks a range. Times snap to whole seconds.
 */
function RangeLayer({
  durationMs,
  playheadMs,
  onSeek,
  onRange,
}: {
  durationMs: number;
  playheadMs: () => number;
  onSeek: (ms: number) => void;
  onRange: (range: TimeRange) => void;
}) {
  const drag = useRef<{
    pointer: number;
    x: number;
    ms: number;
    moved: boolean;
  } | null>(null);

  const msAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - box.left) / box.width),
    );
    return Math.round((ratio * durationMs) / 1000) * 1000;
  };
  const toRange = (a: number, b: number): TimeRange | null => {
    const startMs = Math.min(a, b);
    const endMs = Math.max(a, b);
    return endMs - startMs >= RANGE_MIN_MS ? { startMs, endMs } : null;
  };

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-20 cursor-crosshair touch-pan-y"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointer: event.pointerId,
          x: event.clientX,
          ms: msAt(event),
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d || d.pointer !== event.pointerId) return;
        if (!d.moved && Math.abs(event.clientX - d.x) < 4) return;
        d.moved = true;
        const next = toRange(d.ms, msAt(event));
        if (next) onRange(next);
      }}
      onPointerUp={(event) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.moved) return;
        const at = msAt(event);
        if (event.shiftKey) {
          const next = toRange(Math.floor(playheadMs() / 1000) * 1000, at);
          if (next) onRange(next);
          return;
        }
        onSeek(at);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}
