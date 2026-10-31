"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CommentComposer } from "@/components/comments/comment-composer";
import { CommentList } from "@/components/comments/comment-list";
import {
  WaveformPlayer,
  type TimeRange,
} from "@/components/player/waveform-player";
import { ExportMarkersMenu } from "@/components/track/export-markers-menu";
import { ReferenceLink } from "@/components/track/reference-link";
import { useMockAudioUrl } from "@/mocks/audio";
import { mockMarkersHref, rangeComments, referenceUrl } from "@/mocks/ranges";
import { nightBus } from "@/mocks/tracks";
import type { RangeComment } from "@/types/view";

import { Example, Section } from "./section";

function RangeDemo() {
  const audioUrl = useMockAudioUrl(nightBus.duration_ms);
  const [range, setRange] = useState<TimeRange | null>({
    startMs: 102_000,
    endMs: 118_000,
  });
  const [timeMs, setTimeMs] = useState(0);
  const [comments, setComments] = useState<RangeComment[]>(rangeComments);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <p className="max-w-prose text-sm text-pretty">
          {nightBus.description}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ReferenceLink url={referenceUrl} />
          <ExportMarkersMenu
            trackId={nightBus.id}
            timedCommentCount={
              comments.filter((c) => c.time_ms !== null).length
            }
            hrefFor={mockMarkersHref}
          />
        </div>
      </div>
      <WaveformPlayer
        title={nightBus.title}
        durationMs={nightBus.duration_ms}
        peaks={nightBus.peaks}
        audioUrl={audioUrl}
        comments={comments}
        rangeSelect
        range={range}
        onRangeChange={setRange}
        onTimeChange={setTimeMs}
      />
      <CommentComposer
        currentTimeMs={timeMs}
        durationMs={nightBus.duration_ms}
        signedIn
        range={range}
        onClearRange={() => setRange(null)}
        onSubmit={async (draft) => {
          await new Promise((r) => setTimeout(r, 500));
          setComments((list) => [
            ...list,
            {
              id: `new-${list.length}`,
              track_id: nightBus.id,
              author_id: "u-nora",
              author: list.find((c) => c.author.handle === "nora_makes")!
                .author,
              time_ms: draft.timeMs,
              end_ms: draft.endMs ?? null,
              category: draft.category,
              body: draft.body,
              is_helpful: false,
              status: "live",
              created_at: new Date().toISOString(),
            },
          ]);
          toast.success("Comment posted.");
          return { ok: true };
        }}
      />
      <CommentList comments={comments} viewer="visitor" />
    </div>
  );
}

export function RangeSection() {
  return (
    <Section
      id="range"
      title="Ranges, reference and export"
      description="Comment on a stretch of the track, not just a second: drag across the waveform or shift + click from the playhead. The uploader can add a reference track, and anyone can export the timed comments as markers for their DAW."
    >
      <Example
        title="Wired up"
        note="Drag in the waveform to pick a range, click to seek, shift + click to pick from the playhead. With the player in focus, I and O set the start and end, Escape clears. Export downloads real files built from the mock comments."
      >
        <RangeDemo />
      </Example>
      <div className="grid gap-8 lg:grid-cols-2">
        <Example title="Composer with a range">
          <CommentComposer
            currentTimeMs={0}
            durationMs={nightBus.duration_ms}
            signedIn
            range={{ startMs: 64_000, endMs: 96_000 }}
            onClearRange={() => {}}
            onSubmit={async () => ({ ok: true })}
          />
        </Example>
        <Example title="Nothing to export" note="No comments with a time yet.">
          <ExportMarkersMenu trackId={nightBus.id} timedCommentCount={0} />
        </Example>
      </div>
    </Section>
  );
}
