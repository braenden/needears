"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  fadedSeek,
  fadeInPlay,
  fadeOutPause,
  setListenerVolume,
} from "@/lib/audio/fade";
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
  // A track being started (by Play or its waveform) until its source is
  // set, and the latest spot asked for meanwhile: clicks can come in while
  // its address loads. Undefined is the start.
  const starting = useRef<{ id: string; at?: number } | null>(null);
  // What is loaded and whether it should be playing, read by handlers that
  // run before the next render (a click right after Play).
  const loadedRef = useRef<string | null>(null);
  const wantsToPlay = useRef(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  // A spot picked with the keys on a track that is not loaded: shown on its
  // card, and where Play starts it.
  const [cued, setCued] = useState<{ id: string; at: number } | null>(null);
  // The same volume as the track page's player.
  const volume = useListenVolume();
  useEffect(() => {
    if (playingId) setListenerVolume(shared.get(), volume);
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
    if (loadedRef.current === track.id) {
      // The fade first, the button as a transition after it, so a render
      // cannot hold up the fade. A pause still fading out has not paused
      // yet, so the intent decides, not the element.
      if (!wantsToPlay.current) {
        wantsToPlay.current = true;
        void fadeInPlay(audio).catch(() => {
          wantsToPlay.current = false;
          setIsPlaying(false);
        });
        startTransition(() => setIsPlaying(true));
      } else {
        wantsToPlay.current = false;
        void fadeOutPause(audio);
        startTransition(() => setIsPlaying(false));
      }
      return;
    }
    // Already on its way: a second press while it loads changes nothing.
    if (starting.current?.id === track.id) return;
    starting.current = {
      id: track.id,
      at: at ?? (cued?.id === track.id ? cued.at : undefined),
    };
    let url = tracks.find((t) => t.id === track.id)?.audioUrl ?? null;
    if (!url || Date.now() - loadedAt.current > STALE_MS)
      url = await freshAudioUrl(track.slug);
    if (starting.current?.id !== track.id) return; // another track since
    if (!url) {
      starting.current = null;
      toast.error("This track was removed or is hidden.");
      return;
    }
    setCued(null);
    // Whatever plays now fades out first, instead of stopping with a click.
    if (!audio.paused) await fadeOutPause(audio);
    if (starting.current?.id !== track.id) return;
    shared.claim(owner, { id: track.id, slug: track.slug });
    audio.muted = false;
    setListenerVolume(audio, volume);
    audio.src = url;
    // The latest spot asked for while it loaded. From here on, clicks seek
    // the element directly.
    const startAt = starting.current.at;
    starting.current = null;
    loadedRef.current = track.id;
    wantsToPlay.current = true;
    audio.ontimeupdate = () =>
      startTransition(() =>
        setProgress(audio.duration ? audio.currentTime / audio.duration : 0),
      );
    audio.onplay = () => {
      wantsToPlay.current = true;
      startTransition(() => setIsPlaying(true));
    };
    audio.onpause = () => {
      wantsToPlay.current = false;
      startTransition(() => setIsPlaying(false));
    };
    audio.onended = () => {
      loadedRef.current = null;
      wantsToPlay.current = false;
      setPlayingId(null);
      setProgress(0);
    };
    audio.onerror = () => {
      loadedRef.current = null;
      wantsToPlay.current = false;
      setPlayingId(null);
      toast.error("We couldn't load the audio.");
    };
    setProgress(startAt ?? 0);
    setPlayingId(track.id);
    if (startAt) {
      // Before the metadata is in, this sets where playing starts.
      audio.currentTime = startAt * (track.duration_ms / 1000);
      audio.addEventListener(
        "loadedmetadata",
        () => {
          // Unless a click has moved it since.
          if (audio.currentTime < 0.5)
            audio.currentTime = startAt * audio.duration;
        },
        { once: true },
      );
    }
    try {
      await fadeInPlay(audio);
    } catch {
      loadedRef.current = null;
      wantsToPlay.current = false;
      setPlayingId(null);
    }
  }

  /** Moves the playhead to `at` (0 to 1) without starting it. */
  function cue(track: TrackSummary, at: number) {
    if (starting.current?.id === track.id) {
      starting.current.at = at;
      return;
    }
    if (loadedRef.current !== track.id) {
      setCued({ id: track.id, at });
      return;
    }
    const audio = shared.get();
    const duration = audio.duration || track.duration_ms / 1000;
    // Playing, it fades around the jump; paused, it just moves.
    void fadedSeek(audio, Math.min(at, 0.999) * duration);
    startTransition(() => setProgress(at));
  }

  /** Plays from `at` (0 to 1): the waveform on a card is a seek bar. */
  function seek(track: TrackSummary, at: number) {
    // Still loading (from Play or an earlier click): it starts here.
    if (starting.current?.id === track.id) {
      starting.current.at = at;
      startTransition(() => setProgress(at));
      return;
    }
    if (loadedRef.current !== track.id) {
      void play(track, at);
      return;
    }
    const audio = shared.get();
    const duration = audio.duration || track.duration_ms / 1000;
    const seconds = Math.min(at, 0.999) * duration;
    if (audio.paused || !wantsToPlay.current) {
      // Paused: jump in silence, then fade in from there.
      audio.currentTime = seconds;
      wantsToPlay.current = true;
      void fadeInPlay(audio).catch(() => {
        wantsToPlay.current = false;
        setIsPlaying(false);
      });
      startTransition(() => {
        setIsPlaying(true);
        setProgress(at);
      });
    } else {
      void fadedSeek(audio, seconds);
      startTransition(() => setProgress(at));
    }
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
