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
  showOwner = true,
  showNeedsEars = true,
  className,
}: {
  tracks: PlayableTrack[];
  /** Accessible name of the list. */
  label: string;
  /** Off where every track is by the same person, like on a profile. */
  showOwner?: boolean;
  /** Off where every track needs ears anyway (that tab of the feed). */
  showNeedsEars?: boolean;
  className?: string;
}) {
  const shared = useSharedAudio();
  // Who this list is, for claiming the shared element.
  const [owner] = useState(() => ({}));
  const loadedAt = useRef(0);
  // A track being started from its waveform, and the latest spot asked
  // for while its address loads (another click can come in meanwhile).
  const starting = useRef<{ id: string; at: number } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  // A spot picked with the keys on a track that is not loaded: shown on its
  // card, and where Play starts it.
  const [cued, setCued] = useState<{ id: string; at: number } | null>(null);
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

  /** Plays or pauses; `at` (0 to 1) starts a track that is not on. */
  async function play(track: TrackSummary, at?: number) {
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
      starting.current = null;
      toast.error("This track was removed or is hidden.");
      return;
    }
    // The latest spot clicked while this track was starting, or where the
    // keys left it.
    if (starting.current?.id === track.id) at = starting.current.at;
    else if (at === undefined && cued?.id === track.id) at = cued.at;
    setCued(null);
    starting.current = null;
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
    setProgress(at ?? 0);
    setPlayingId(track.id);
    if (at) {
      // Before the metadata is in, this sets where playing starts.
      audio.currentTime = at * (track.duration_ms / 1000);
      audio.addEventListener(
        "loadedmetadata",
        () => {
          audio.currentTime = at * audio.duration;
        },
        { once: true },
      );
    }
    try {
      await audio.play();
    } catch {
      setPlayingId(null);
    }
  }

  /** Moves the playhead to `at` (0 to 1) without starting it. */
  function cue(track: TrackSummary, at: number) {
    if (playingId !== track.id) {
      setCued({ id: track.id, at });
      return;
    }
    const audio = shared.get();
    const duration = audio.duration || track.duration_ms / 1000;
    audio.currentTime = Math.min(at, 0.999) * duration;
    setProgress(at);
  }

  /** Plays from `at` (0 to 1): the waveform on a card is a seek bar. */
  function seek(track: TrackSummary, at: number) {
    const audio = shared.get();
    if (playingId !== track.id) {
      if (starting.current?.id === track.id) {
        starting.current.at = at;
        return;
      }
      starting.current = { id: track.id, at };
      void play(track, at);
      return;
    }
    const duration = audio.duration || track.duration_ms / 1000;
    audio.currentTime = Math.min(at, 0.999) * duration;
    setProgress(at);
    if (audio.paused) void audio.play();
  }

  return (
    <ul aria-label={label} className={className}>
      {tracks.map((track) => (
        <li key={track.id}>
          <TrackCard
            track={track}
            playing={playingId === track.id && isPlaying}
            progress={
              playingId === track.id
                ? progress
                : cued?.id === track.id
                  ? cued.at
                  : 0
            }
            onPlay={(t) => void play(t)}
            onSeek={seek}
            onCue={cue}
            showOwner={showOwner}
            showNeedsEars={showNeedsEars}
          />
        </li>
      ))}
    </ul>
  );
}
