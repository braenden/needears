"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  CommentComposer,
  type CommentComposerHandle,
  type SubmitResult,
} from "@/components/comments/comment-composer";
import {
  activeCommentAt,
  CommentList,
} from "@/components/comments/comment-list";
import { displayNameOf } from "@/components/common/user-avatar";
import {
  WaveformPlayer,
  type WaveformPlayerHandle,
} from "@/components/player/waveform-player";
import { ReactionBar } from "@/components/reaction-bar";
import { ReportDialog } from "@/components/report-dialog";
import { useMockAudioUrl } from "@/mocks/audio";
import { comments as mockComments } from "@/mocks/comments";
import { mia, nora } from "@/mocks/profiles";
import { nightBus } from "@/mocks/tracks";
import type { Comment, ReactionKind } from "@/types/view";

import { ChoiceGroup } from "./choice-group";

type Viewer = "owner" | "visitor" | "signed_out";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The track page put together from the parts, wired to mock state: the
 * playhead highlights comments, C comments at the current second, clicking a
 * time jumps there. Type "fail" or "limit" in a comment to see those errors.
 */
export function TrackPageDemo() {
  const audioUrl = useMockAudioUrl(nightBus.duration_ms);
  const player = useRef<WaveformPlayerHandle>(null);
  const composer = useRef<CommentComposerHandle>(null);
  const [viewer, setViewer] = useState<Viewer>("visitor");
  const [comments, setComments] = useState<Comment[]>(mockComments);
  const [timeMs, setTimeMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mine, setMine] = useState<ReactionKind[]>(["fire"]);
  const [counts, setCounts] = useState(nightBus.reaction_counts);
  const [reporting, setReporting] = useState(false);

  const activeId = selectedId ?? activeCommentAt(comments, timeMs)?.id ?? null;

  async function submit(draft: {
    body: string;
    category: Comment["category"];
    timeMs: number | null;
  }): Promise<SubmitResult> {
    await wait(700);
    if (draft.body.toLowerCase().includes("fail"))
      return { ok: false, error: "failed" };
    if (draft.body.toLowerCase().includes("limit"))
      return { ok: false, error: "rate_limited" };
    setComments((list) => [
      ...list,
      {
        id: `new-${list.length}`,
        track_id: nightBus.id,
        author: viewer === "owner" ? nightBus.owner : nora,
        author_id: viewer === "owner" ? nightBus.owner.id : nora.id,
        is_helpful: false,
        status: "live",
        created_at: new Date().toISOString(),
        body: draft.body,
        category: draft.category,
        time_ms: draft.timeMs,
      },
    ]);
    return { ok: true };
  }

  return (
    <div className="grid gap-4">
      <ChoiceGroup<Viewer>
        label="View as"
        value={viewer}
        onChange={setViewer}
        options={[
          { value: "owner", label: "Owner" },
          { value: "visitor", label: "Visitor" },
          { value: "signed_out", label: "Signed out" },
        ]}
      />
      <div>
        <h3 className="font-display text-2xl font-bold tracking-tight">
          {nightBus.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {displayNameOf(nightBus.owner)}, {nightBus.genre.name}
        </p>
      </div>
      <WaveformPlayer
        ref={player}
        title={nightBus.title}
        durationMs={nightBus.duration_ms}
        peaks={nightBus.peaks}
        audioUrl={audioUrl}
        comments={comments}
        activeCommentId={activeId}
        onTimeChange={(ms) => {
          setTimeMs(ms);
          setSelectedId(null);
        }}
        onMarkerSelect={(c) => setSelectedId(c.id)}
        onCommentHere={(ms) => composer.current?.focusAt(ms)}
      />
      <ReactionBar
        counts={counts}
        mine={mine}
        signedIn={viewer !== "signed_out"}
        shareUrl="https://needears.com/t/k3x9-night-bus"
        onSignIn={() => toast("Sign in to react.")}
        onToggle={(kind, on) => {
          setMine((m) => (on ? [...m, kind] : m.filter((k) => k !== kind)));
          setCounts((c) => ({ ...c, [kind]: c[kind] + (on ? 1 : -1) }));
        }}
      />
      <CommentComposer
        ref={composer}
        currentTimeMs={timeMs}
        durationMs={nightBus.duration_ms}
        signedIn={viewer !== "signed_out"}
        onSubmit={submit}
        onSignIn={() => toast("This would go to /login.")}
      />
      <CommentList
        comments={comments}
        viewer={viewer}
        activeCommentId={activeId}
        onJump={(c) => {
          if (c.time_ms !== null) player.current?.seekTo(c.time_ms);
          setSelectedId(c.id);
        }}
        onToggleHelpful={(c, helpful) => {
          setComments((list) =>
            list.map((x) => (x.id === c.id ? { ...x, isHelpful: helpful } : x)),
          );
          if (helpful)
            toast.success(
              `Marked as Helpful. ${displayNameOf(c.author)} gets credit for it.`,
            );
        }}
        onReport={() => setReporting(true)}
        onSignIn={() => toast("This would go to /login.")}
      />
      <ReportDialog
        target="comment"
        trigger={null}
        open={reporting}
        onOpenChange={setReporting}
        onSubmit={async () => {
          await wait(600);
          return { ok: true };
        }}
      />
      <p className="text-xs text-muted-foreground">
        Mock: {displayNameOf(mia)} and the others are made up. Audio is a quiet
        tick generated in the browser.
      </p>
    </div>
  );
}
