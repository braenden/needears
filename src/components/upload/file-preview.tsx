"use client";

import { useEffect, useRef, useState } from "react";

import { PlayPauseIcon } from "@/components/player/play-pause-icon";
import { MiniWaveform } from "@/components/track/mini-waveform";
import { SeekWaveform } from "@/components/track/seek-waveform";
import { Button } from "@/components/ui/button";
import { fadedSeek, fadeInPlay, fadeOutPause } from "@/lib/audio/fade";
import { formatTime } from "@/lib/time";

import { extensionOf } from "./upload-state";

const TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  flac: "audio/flac",
};

/** Whether this browser can play the file as it is (not all play aiff). */
function canPlay(file: File) {
  const type = file.type || TYPES[extensionOf(file.name)] || "";
  return !!type && document.createElement("audio").canPlayType(type) !== "";
}

/**
 * The picked file's waveform, to listen to before publishing: play from the
 * start or from any spot. Where the browser cannot play the format, the
 * waveform alone. Keyed by the file, so a new file starts over.
 */
export function FilePreview({
  file,
  title,
  peaks,
  durationMs,
}: {
  file: File;
  title: string;
  peaks: number[];
  durationMs: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playable] = useState(() => canPlay(file));
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // The file plays straight from the computer: nothing is uploaded yet.
  useEffect(() => {
    const element = audio.current;
    if (!element || !playable) return;
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => {
      element.pause();
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    };
  }, [file, playable]);

  const play = () => {
    const element = audio.current;
    if (element) void fadeInPlay(element).catch(() => setPlaying(false));
  };
  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) play();
    else void fadeOutPause(element);
  };
  const moveTo = (at: number) => {
    const element = audio.current;
    if (!element) return;
    setProgress(at);
    void fadedSeek(element, (at * durationMs) / 1000);
  };

  return (
    <div className="flex items-center gap-3">
      {playable ? (
        <>
          <Button
            type="button"
            size="icon"
            variant={playing ? "default" : "secondary"}
            className="shrink-0 rounded-full"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play your file"}
          >
            <PlayPauseIcon playing={playing} />
          </Button>
          <SeekWaveform
            className="min-w-0 flex-1"
            track={{ title, peaks, duration_ms: durationMs }}
            progress={progress}
            onSeek={(at) => {
              moveTo(at);
              play();
            }}
            onMove={moveTo}
            onToggle={toggle}
          />
          <audio
            ref={audio}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) =>
              setProgress(
                Math.min(1, (e.currentTarget.currentTime * 1000) / durationMs),
              )
            }
          />
        </>
      ) : (
        <MiniWaveform
          peaks={peaks}
          bars={120}
          className="h-10 min-w-0 flex-1 @sm:h-12"
        />
      )}
      <time data-numeric className="shrink-0 text-sm text-muted-foreground">
        {formatTime(durationMs)}
      </time>
    </div>
  );
}
