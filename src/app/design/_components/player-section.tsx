"use client";

import { CommentComposer } from "@/components/comments/comment-composer";
import { CommentList } from "@/components/comments/comment-list";
import { WaveformPlayer } from "@/components/player/waveform-player";
import { comments } from "@/mocks/comments";
import { firstTrack, longTitle, nightBus } from "@/mocks/tracks";

import { TrackPageDemo } from "./track-page-demo";
import { Example, Section } from "./section";

const never = () => new Promise<never>(() => {});

// A busy track: 40 comments, bunched where people tend to comment (the
// drop, the break), so the markers group and the density stripe shows.
const busy = Array.from({ length: 40 }, (_, i) => {
  const base = comments[i % comments.length]!;
  const spot = [0.2, 0.45, 0.78][i % 3]! * nightBus.duration_ms;
  return {
    ...base,
    id: `busy-${i}`,
    time_ms: Math.round(spot + (i % 7) * 2_500),
  };
});
const ok = async () => ({ ok: true as const });

export function PlayerSection() {
  return (
    <>
      <Section
        id="track-page"
        title="Track page, wired up"
        description="WaveformPlayer, ReactionBar, CommentComposer and CommentList working together on mock data. Click the waveform or a marker, press C in the player, mark comments Helpful as owner."
      >
        <TrackPageDemo />
      </Section>

      <Section
        id="player"
        title="WaveformPlayer"
        description="wavesurfer.js v7 with precomputed peaks (no decoding), an own DOM marker layer with names and focus, keyboard control and a visually hidden range input for screen readers."
      >
        <Example
          title="Loading"
          note="Peaks show at once. Play waits for the audio."
        >
          <WaveformPlayer
            title={nightBus.title}
            durationMs={nightBus.duration_ms}
            peaks={nightBus.peaks}
            comments={comments}
            forceStatus="loading"
          />
        </Example>
        <Example
          title="Busy track, 40 comments"
          note="Markers closer than 24 pixels share a number; tap it to jump and list them. Above 30 comments a stripe shows where they bunch up."
        >
          <WaveformPlayer
            title={nightBus.title}
            durationMs={nightBus.duration_ms}
            peaks={nightBus.peaks}
            comments={busy}
          />
        </Example>
        <Example title="Audio failed to load">
          <WaveformPlayer
            title={nightBus.title}
            durationMs={nightBus.duration_ms}
            peaks={nightBus.peaks}
            forceStatus="error"
          />
        </Example>
        <Example title="No comments, long track (12:11)">
          <WaveformPlayer
            title={longTitle.title}
            durationMs={longTitle.duration_ms}
            peaks={longTitle.peaks}
          />
        </Example>
        <Example
          title="Compact"
          note="For the sticky player at the bottom of the track page on mobile."
        >
          <WaveformPlayer
            title={firstTrack.title}
            durationMs={firstTrack.duration_ms}
            peaks={firstTrack.peaks}
            size="compact"
          />
        </Example>
      </Section>

      <Section
        id="composer"
        title="CommentComposer"
        description="Anchored to the current second until you start typing. The time can be changed, or the comment can be about the whole track. Cmd or Ctrl + Enter sends."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <Example title="Default">
            <CommentComposer
              currentTimeMs={102_000}
              durationMs={nightBus.duration_ms}
              signedIn
              onSubmit={ok}
            />
          </Example>
          <Example title="Signed out">
            <CommentComposer
              currentTimeMs={0}
              durationMs={nightBus.duration_ms}
              signedIn={false}
              onSubmit={ok}
            />
          </Example>
          <Example title="Empty submit">
            <CommentComposer
              currentTimeMs={31_000}
              durationMs={nightBus.duration_ms}
              signedIn
              onSubmit={ok}
              initialError="empty"
            />
          </Example>
          <Example title="Failed to post, text kept">
            <CommentComposer
              currentTimeMs={64_000}
              durationMs={nightBus.duration_ms}
              signedIn
              onSubmit={ok}
              initialBody="The build is eight bars too long for me."
              initialError="failed"
            />
          </Example>
          <Example title="Rate limited">
            <CommentComposer
              currentTimeMs={64_000}
              durationMs={nightBus.duration_ms}
              signedIn
              onSubmit={ok}
              initialBody="One more thought on the hats."
              initialError="rate_limited"
            />
          </Example>
          <Example
            title="Near the limit, sending"
            note="Press Comment to see the sending state (never resolves)."
          >
            <CommentComposer
              currentTimeMs={171_000}
              durationMs={nightBus.duration_ms}
              signedIn
              maxLength={120}
              onSubmit={never}
              initialBody="Low end gets muddy when the second bassline comes in. Sidechain one of them to the other, or high-pass the top."
            />
          </Example>
        </div>
      </Section>

      <Section
        id="comment-list"
        title="CommentList"
        description="Filter (All, Helpful, From trusted ears), sort by time or newest, Helpful for the owner, reputation chip, jump to time."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <Example title="Owner">
            <CommentList comments={comments} viewer="owner" />
          </Example>
          <Example title="Loading">
            <CommentList comments={[]} viewer="visitor" loading />
          </Example>
          <Example title="Empty, visitor">
            <CommentList comments={[]} viewer="visitor" />
          </Example>
          <Example title="Empty, signed out">
            <CommentList comments={[]} viewer="signed_out" />
          </Example>
          <Example title="Empty, owner">
            <CommentList comments={[]} viewer="owner" />
          </Example>
          <Example title="Filter with no matches">
            <CommentList
              comments={comments.filter((c) => !c.is_helpful)}
              viewer="visitor"
              defaultFilter="helpful"
            />
          </Example>
        </div>
      </Section>
    </>
  );
}
