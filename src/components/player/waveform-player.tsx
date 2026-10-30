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
import type { Comment } from "@/types/view";

import { CommentMarkers } from "./comment-markers";

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
  comments?: Comment[];
  activeCommentId?: string | null;
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
  const onTimeChangeRef = useRef(onTimeChange);
  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

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
        dragToSeek: true,
        hideScrollbar: true,
        normalize: false,
        ...readColors(root),
      });
      wsRef.current = ws;
      let lastSecond = -1;
      const report = (seconds: number) => {
        const whole = Math.floor(seconds);
        if (whole === lastSecond) return;
        lastSecond = whole;
        setCurrentMs(whole * 1000);
        onTimeChangeRef.current?.(whole * 1000);
      };
      ws.on("ready", () => {
        setReadyUrl(audioUrl ?? null);
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
      ws?.destroy();
      wsRef.current = null;
    };
  }, [peaks, durationMs, audioUrl, height, attempt]);

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
      }
    },
    [currentMs, durationMs, onCommentHere, seekTo, toggleMute, togglePlay],
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
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} className="contents">
                <dt>
                  <kbd className="rounded-xs border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium">
                    {key}
                  </kbd>
                </dt>
                <dd className="text-muted-foreground">{label}</dd>
              </div>
            ))}
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
