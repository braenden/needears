"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { MessageSquareIcon } from "lucide-react";

import { activeCommentAt } from "@/components/comments/comment-list";
import { displayNameOf } from "@/components/common/user-avatar";
import { useSharedAudio } from "@/components/player/shared-audio";
import {
  WaveformPlayer,
  type WaveformPlayerHandle,
} from "@/components/player/waveform-player";
import { TrackList, type PlayableTrack } from "@/components/track/track-list";
import { trackNote } from "@/components/track/track-row";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { fadeOutPause } from "@/lib/audio/fade";
import { formatSpan } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { RangeComment, Track } from "@/types/view";

/** How many comments are written out under the player. */
const SHOWN = 3;

export type HomeTrack = {
  track: Track;
  audioUrl: string | null;
  /** Timed comments on the version that plays, in order of time. */
  comments: RangeComment[];
};

/**
 * The home page's tracks: one real track to play beside the intro, with
 * its comments marked on the waveform and a few written out, and a few
 * rows under it (trending, or the newest when nothing is). The page's player has an element of its own,
 * the rows share the site's: whichever starts, the other stops.
 */
export function HomeTracks({
  featured,
  rows,
  newest,
  children,
}: {
  featured: HomeTrack | null;
  rows: PlayableTrack[];
  /** The rows are the newest tracks, not the trending ones. */
  newest: boolean;
  /** The intro: the heading, a sentence and the two ways in. */
  children: React.ReactNode;
}) {
  const shared = useSharedAudio();
  const player = useRef<WaveformPlayerHandle>(null);

  return (
    <>
      <section
        className={cn(
          "pt-8 pb-12 sm:pt-14 sm:pb-16",
          featured &&
            "grid items-center gap-10 lg:grid-cols-2 lg:gap-12 lg:pt-10",
        )}
      >
        <div>{children}</div>
        {featured ? (
          <FeaturedTrack
            {...featured}
            player={player}
            onPlay={() => {
              const other = shared.get();
              if (!other.paused) void fadeOutPause(other);
            }}
          />
        ) : null}
      </section>

      {rows.length > 0 ? (
        <section aria-labelledby="rows-heading" className="pt-2">
          <h2
            id="rows-heading"
            className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {newest ? "New tracks" : "Trending now"}
          </h2>
          <TrackList
            tracks={rows}
            label={newest ? "New tracks" : "Trending tracks"}
            beforePlay={() => player.current?.pause()}
            className="mt-2"
          />
          <Link
            href="/feed"
            className="mt-4 inline-block rounded-xs text-sm text-primary-text underline-offset-4 focus-ring outline-none hover:underline"
          >
            See the whole feed
          </Link>
        </section>
      ) : null}
    </>
  );
}

/**
 * A track as it is on its own page, small: who made it and what they ask,
 * the player with a marker per comment, and a few of the comments. A time
 * plays from there, and the comment being played through is lit.
 */
function FeaturedTrack({
  track,
  audioUrl: initialAudioUrl,
  comments,
  player,
  onPlay,
}: HomeTrack & {
  player: React.RefObject<WaveformPlayerHandle | null>;
  /** When this track starts. */
  onPlay: () => void;
}) {
  const audioUrl = useSignedUrl(track.slug, initialAudioUrl);
  const [timeMs, setTimeMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  // Written out: the ones the artist marked as helpful first.
  const shown = [...comments]
    .sort((a, b) => Number(b.is_helpful) - Number(a.is_helpful))
    .slice(0, SHOWN)
    .sort((a, b) => (a.time_ms ?? 0) - (b.time_ms ?? 0));
  // Nothing is lit before the track has been played or a spot picked.
  const activeId = started
    ? (selectedId ?? activeCommentAt(comments, timeMs)?.id ?? null)
    : null;
  const note = trackNote(track);
  const count = track.comment_count;

  return (
    <article
      aria-labelledby="featured-title"
      className="min-w-0 rounded-2xl border bg-card p-4 text-card-foreground sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="featured-title"
            className="text-lg leading-snug font-semibold"
          >
            <Link
              href={`/t/${track.slug}`}
              className="block truncate rounded-xs focus-ring outline-none hover:underline hover:decoration-1 hover:underline-offset-4"
            >
              {track.title}
            </Link>
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            <Link
              href={`/u/${track.owner.handle}`}
              className="rounded-xs focus-ring outline-none hover:text-foreground hover:underline hover:underline-offset-4"
            >
              {displayNameOf(track.owner)}
            </Link>
            {" · "}
            {track.genre.name}
          </p>
        </div>
        <Link
          href={`/t/${track.slug}#comments`}
          className="touch-hit mt-1 flex shrink-0 items-center gap-1 rounded-xs text-[13px] text-muted-foreground focus-ring outline-none hover:text-foreground"
        >
          <MessageSquareIcon className="size-3.5" aria-hidden="true" />
          <span data-numeric>{count}</span>
          <span className="sr-only">
            {count === 1 ? " comment" : " comments"}
          </span>
        </Link>
      </div>
      {note ? (
        <p className="mt-3 truncate text-sm text-muted-foreground">{note}</p>
      ) : null}

      <WaveformPlayer
        ref={player}
        className="mt-4"
        title={track.title}
        durationMs={track.duration_ms}
        peaks={track.peaks}
        audioUrl={audioUrl}
        comments={comments}
        activeCommentId={activeId}
        onPlayingChange={(on) => {
          if (!on) return;
          setStarted(true);
          onPlay();
        }}
        onTimeChange={(ms) => {
          setTimeMs(ms);
          setSelectedId(null);
        }}
        onMarkerSelect={(comment) => {
          setStarted(true);
          setSelectedId(comment.id);
        }}
      />

      {shown.length > 0 ? (
        <ul aria-label="Comments" className="mt-4 grid gap-1 border-t pt-3">
          {shown.map((comment) => {
            const span = formatSpan(comment.time_ms ?? 0, comment.end_ms);
            return (
              <li
                key={comment.id}
                className={cn(
                  "-mx-2 flex gap-3 rounded-lg px-2 py-2 text-sm transition-colors duration-base",
                  comment.id === activeId && "bg-primary-soft",
                )}
              >
                {/* The time plays from there, as on the track's page. */}
                <button
                  type="button"
                  onClick={() => {
                    player.current?.seekTo(comment.time_ms ?? 0);
                    player.current?.play();
                  }}
                  aria-label={`Play from ${span}`}
                  className="touch-hit h-5 min-w-9 shrink-0 rounded-xs text-left font-medium whitespace-nowrap text-primary-text focus-ring outline-none hover:underline hover:underline-offset-4"
                >
                  <time data-numeric>{span}</time>
                </button>
                <p className="min-w-0 flex-1 break-words">
                  <span className="line-clamp-2">{comment.body}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                    {displayNameOf(comment.author)}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
