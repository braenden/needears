"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { freshAudioUrl } from "@/app/actions/media";
import { useSharedAudio } from "@/components/player/shared-audio";
import { useListenVolume } from "@/hooks/use-volume";
import type { TrackSummary } from "@/types/view";
import { TrackCard } from "./track-card";

export type PlayableTrack = TrackSummary & { audioUrl: string | null };

// Signed URLs live for an hour; re-sign before playing after this long.
const STALE_MS = 50 * 60 * 1000;

/**
 * A list of track cards that can be played in place, on the site's shared
 * audio element, so starting a track stops the one before it, and a track
 * keeps playing when its page is opened.
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
  const shared = useSharedAudio();
  // Who this list is, for claiming the shared element.
  const [owner] = useState(() => ({}));
  const loadedAt = useRef(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  // The same volume as the track page's player.
  const volume = useListenVolume();
  useEffect(() => {
    if (playingId) shared.get().volume = volume;
  }, [shared, playingId, volume]);

  useEffect(() => {
    loadedAt.current = Date.now();
    return () => {
      if (!shared.holds(owner)) return;
      // Stop listening, and let go: it plays on if its page opens next.
      const audio = shared.get();
      audio.ontimeupdate = null;
      audio.onplay = null;
      audio.onpause = null;
      audio.onended = null;
      audio.onerror = null;
      shared.release(owner);
    };
  }, [shared, owner]);

  async function play(track: TrackSummary) {
    const audio = shared.get();
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
    shared.claim(owner, { id: track.id, slug: track.slug });
    audio.muted = false;
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
