"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { freshAudioUrl } from "@/app/actions/media";
import { useListenVolume } from "@/hooks/use-volume";
import type { TrackSummary } from "@/types/view";
import { TrackCard } from "./track-card";

export type PlayableTrack = TrackSummary & { audioUrl: string | null };

// Signed URLs live for an hour; re-sign before playing after this long.
const STALE_MS = 50 * 60 * 1000;

/**
 * A list of track cards that can be played in place. One audio element for
 * the whole list, so starting a track stops the one before it.
 */
export function TrackList({
  tracks,
  label,
  className,
}: {
  tracks: PlayableTrack[];
  /** Accessible name of the list. */
  label: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedAt = useRef(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  // The same volume as the track page's player.
  const volume = useListenVolume();
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    loadedAt.current = Date.now();
    return () => audioRef.current?.pause();
  }, []);

  async function play(track: TrackSummary) {
    const audio = (audioRef.current ??= new Audio());
    if (playingId === track.id) {
      if (audio.paused) void audio.play();
      else audio.pause();
      return;
    }
    let url = tracks.find((t) => t.id === track.id)?.audioUrl ?? null;
    if (!url || Date.now() - loadedAt.current > STALE_MS)
      url = await freshAudioUrl(track.slug);
    if (!url) {
      toast.error("This track was removed or is hidden.");
      return;
    }
    audio.pause();
    audio.volume = volume;
    audio.src = url;
    audio.ontimeupdate = () =>
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => {
      setPlayingId(null);
      setProgress(0);
    };
    audio.onerror = () => {
      setPlayingId(null);
      toast.error("We couldn't load the audio.");
    };
    setProgress(0);
    setPlayingId(track.id);
    try {
      await audio.play();
    } catch {
      setPlayingId(null);
    }
  }

  return (
    <ul aria-label={label} className={className}>
      {tracks.map((track) => (
        <li key={track.id}>
          <TrackCard
            track={track}
            playing={playingId === track.id && isPlaying}
            progress={playingId === track.id ? progress : 0}
            onPlay={(t) => void play(t)}
          />
        </li>
      ))}
    </ul>
  );
}
