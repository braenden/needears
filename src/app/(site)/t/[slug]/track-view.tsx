"use client";

import {
  keepPending,
  type PendingPost,
  takePending,
} from "@/lib/comments/pending";
import { Suspense, use, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  EllipsisIcon,
  EyeOffIcon,
  FlagIcon,
  InfoIcon,
  KeyboardIcon,
  LinkIcon,
  PencilIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  CommentComposer,
  type CommentComposerHandle,
  type CommentDraft,
  type SubmitResult,
} from "@/components/comments/comment-composer";
import {
  activeCommentAt,
  type CommentFilter,
  CommentList,
  type DeleteResult,
  isWithdrawn,
} from "@/components/comments/comment-list";
import { RelativeTime } from "@/components/common/relative-time";
import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { MiniPlayerBar } from "@/components/player/mini-player-bar";
import { useSharedAudio } from "@/components/player/shared-audio";
import { Page, PageTitle } from "@/components/shell/page";
import {
  type TimeRange,
  WaveformPlayer,
  type WaveformPlayerHandle,
} from "@/components/player/waveform-player";
import { moveReaction, ReactionBar } from "@/components/reaction-bar";
import { ReportDialog, type ReportResult } from "@/components/report-dialog";
import type { EditTrackResult } from "@/components/track/edit-track-dialog";
import {
  ExportMarkersSubmenu,
  markersHref,
} from "@/components/track/export-markers-menu";
import { DeleteTrackDialog } from "@/components/track/delete-track-dialog";
import { ReferenceLink } from "@/components/track/reference-link";
import { VersionPicker } from "@/components/versions/version-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TrackList } from "@/components/track/track-list";
import { fadeOutPause } from "@/lib/audio/fade";
import { cn } from "@/lib/utils";
import type { Details } from "@/components/upload/upload-state";
import type { BadgeKind } from "@/components/profile/badges";
import type { CardTrack, PlayableVersion } from "@/lib/data/tracks";
import { FEEDBACK_WANT_LABELS, LEVEL_DISPLAY_LABELS } from "@/config/labels";
import { siteUrl } from "@/config/site";
import { VERSIONS_MAX } from "@/config/versions";
import { usePlayCounter } from "@/hooks/use-play-counter";
import { shareReactionCounts } from "@/hooks/use-reaction-counts";
import { matchGainDb } from "@/lib/audio/loudness";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { formatPlays } from "@/lib/plays";
import { browserClient } from "@/lib/supabase/lazy";
import { parseTags } from "@/lib/upload/tags";
import type {
  Comment,
  Genre,
  Profile,
  ReactionKind,
  ReportReason,
  ThreadComment,
  Track,
  TrackVersion,
} from "@/types/view";

/**
 * The database refuses posts from someone who has not picked a username
 * yet (the page asks first, so this is only for a stale page).
 */
function handleRequired(error: { code?: string; message?: string }) {
  return error.code === "42501" && error.message === "handle_required";
}

/** Who a deleted comment kept for its replies is from: nobody. */
const WITHDRAWN_AUTHOR = {
  id: "",
  handle: "",
  display_name: "",
  avatar_url: null,
  reputation: 0,
};

const COMMENT_COLUMNS =
  "id, track_id, author_id, parent_id, version_id, time_ms, end_ms, category, body, is_helpful, status, resolved_at, created_at, edited_at, author:profiles!comments_author_id_fkey(id, handle, display_name, avatar_url, reputation)";

// Only the owner needs these, so everyone else never downloads them.
const NewVersion = dynamic(
  () => import("./new-version").then((m) => m.NewVersion),
  {
    // Opened from the track's menu, as a dialog over the page.
    ssr: false,
  },
);

const EditTrackDialog = dynamic(
  () =>
    import("@/components/track/edit-track-dialog").then(
      (m) => m.EditTrackDialog,
    ),
  { ssr: false },
);

type TrackViewer = {
  userId: string;
  profile: Profile;
  commentsPerHour: number;
  isAdmin: boolean;
  /** Has picked a username. Until then nothing is posted in their name. */
  onboarded: boolean;
};

export function TrackView({
  track,
  audioUrl: initialAudioUrl,
  initialComments,
  initialReactions,
  viewer,
  startSeconds,
  initialFilter,
  initialShowResolved,
  genres,
  versions,
  authorBadges,
  moreToHear,
}: {
  track: Track;
  audioUrl: string | null;
  initialComments: ThreadComment[];
  /** The viewer's reaction, if any. */
  initialReactions: ReactionKind | null;
  viewer: TrackViewer | null;
  startSeconds: number;
  initialFilter: CommentFilter;
  initialShowResolved: boolean;
  /** Only passed to the owner, for editing the details. */
  genres: Genre[] | null;
  /** Oldest first; the last one is the latest. */
  versions: PlayableVersion[];
  authorBadges: Record<string, BadgeKind[]>;
  /** "More to hear", on its way from the server. */
  moreToHear: Promise<CardTrack[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const audioUrl = useSignedUrl(track.slug, initialAudioUrl);
  const player = useRef<WaveformPlayerHandle>(null);
  const composer = useRef<CommentComposerHandle>(null);
  const [comments, setComments] = useState(initialComments);
  // Posted on this page just now: they fade in and glow for a moment.
  const [posted, setPosted] = useState<string[]>([]);
  const [timeMs, setTimeMs] = useState(startSeconds * 1000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mine, setMine] = useState(initialReactions);
  const [counts, setCounts] = useState(track.reaction_counts);
  // Cards for this track elsewhere (the feed kept for going back) follow.
  const fullPlayer = useRef<HTMLDivElement>(null);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  // On phones a slim bar takes over once the full player has scrolled up
  // out of sight.
  const [scrolledPast, setScrolledPast] = useState(false);
  useEffect(() => {
    const target = fullPlayer.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(
      ([entry]) =>
        setScrolledPast(
          !!entry && !entry.isIntersecting && entry.boundingClientRect.top < 0,
        ),
      // Below the 56 pixel header.
      { rootMargin: "-56px 0px 0px 0px" },
    );
    watch.observe(target);
    return () => watch.disconnect();
  }, []);
  // Arriving at #comments from a card: the jump to it can happen before
  // the page is in (while the skeleton shows), so jump once more now.
  const commentsSection = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash !== "#comments") return;
    const frame = requestAnimationFrame(() =>
      commentsSection.current?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    shareReactionCounts(track.id, counts);
  }, [track.id, counts]);
  const [filter, setFilter] = useState<CommentFilter>(initialFilter);
  const [showResolved, setShowResolved] = useState(initialShowResolved);
  const [editing, setEditing] = useState(false);
  const [addingVersion, setAddingVersion] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [range, setRange] = useState<TimeRange | null>(null);
  const latest = versions[versions.length - 1];
  const [versionId, setVersionId] = useState(latest?.id ?? null);
  // The version that sounds. It follows versionId a moment later while
  // playing, after the sound has faded out, so switching does not click.
  const [soundVersionId, setSoundVersionId] = useState(versionId);
  const soundSwitch = useRef(0);
  const [previousVersionId, setPreviousVersionId] = useState<string | null>(
    null,
  );
  // Just published, until the page has it from the server.
  const [newVersion, setNewVersion] = useState<TrackVersion | null>(null);
  const pickable =
    newVersion && !versions.some((v) => v.id === newVersion.id)
      ? [...versions, newVersion]
      : versions;
  const countPlay = usePlayCounter(track.id, track.duration_ms);
  // The site's shared audio element. When the feed was playing this track,
  // the page takes it over and carries on from the same address, without
  // starting over. Otherwise the page has a player of its own, and whatever
  // the feed played stops.
  const shared = useSharedAudio();
  const [audioOwner] = useState(() => ({}));
  const [carriedSrc] = useState(() => shared.playingSrc(track.id));
  // The feed's address until the page renews it.
  const [firstAudioUrl] = useState(audioUrl);
  // Once a track from "More to hear" plays, the shared element is its:
  // the page's player steps aside to an element of its own.
  const [steppedAside, setSteppedAside] = useState(false);
  const carrying = !!carriedSrc && audioUrl === firstAudioUrl && !steppedAside;
  useEffect(() => {
    if (!carriedSrc || steppedAside) return;
    shared.claim(audioOwner, { id: track.id, slug: track.slug });
    return () => shared.release(audioOwner);
  }, [shared, audioOwner, carriedSrc, steppedAside, track.id, track.slug]);
  const [showingDetails, setShowingDetails] = useState(false);
  // On a phone: the whole note and the facts, after a tap.
  const [showingMore, setShowingMore] = useState(false);

  /** Before a track from "More to hear" plays: this one stops and lets go. */
  function stepAside() {
    player.current?.pause();
    // Committed at once, so the page's player has let go of the shared
    // element before the other track is put in it.
    if (carrying) flushSync(() => setSteppedAside(true));
  }
  const [reporting, setReporting] = useState<
    { type: "track" } | { type: "comment"; id: string } | null
  >(null);

  const isOwner = viewer?.userId === track.owner_id;
  // With more than one version, the player, the markers and the list follow
  // the picked version. Until a new version arrives from the server after
  // publishing, the latest one plays.
  const versioned = versions.length > 1;
  const current = versions.find((v) => v.id === versionId) ?? latest;
  const sounding = versions.find((v) => v.id === soundVersionId) ?? latest;
  const isLatest = !sounding || sounding.id === latest?.id;
  const playing = {
    durationMs: sounding?.duration_ms ?? track.duration_ms,
    peaks: sounding?.peaks ?? track.peaks,
    // The latest version's URL is refreshed when it expires.
    audioUrl: isLatest
      ? carrying
        ? carriedSrc
        : audioUrl
      : (sounding?.audioUrl ?? null),
  };
  const measured = versions
    .map((v) => v.loudness)
    .filter((l): l is number => l !== null);
  const gainDb = versioned
    ? matchGainDb(
        sounding?.loudness ?? null,
        measured.length > 0 ? Math.min(...measured) : null,
      )
    : 0;
  const versionNumbers = Object.fromEntries(
    versions.map((v) => [v.id, v.version_no]),
  );
  const onVersion = (c: ThreadComment) =>
    !versioned || !c.version_id || c.version_id === current?.id;
  const viewerKind = !viewer ? "signed_out" : isOwner ? "owner" : "visitor";
  // Replies sit at their parent's time, so only top-level comments get a
  // marker on the waveform.
  // A deleted comment kept for its replies counts and marks nothing.
  const topLevel = comments.filter((c) => !c.parent_id && !isWithdrawn(c));
  const listed = comments.filter(onVersion);
  // The heading says what the track's rows say: every live comment and
  // reply on the track. It follows what is posted or deleted here until the
  // page reloads with a new count.
  const live = (list: ThreadComment[]) =>
    list.filter((c) => c.status === "live").length;
  const commentCount =
    track.comment_count + live(comments) - live(initialComments);
  // On the waveform: what the list shows. Resolved ones while they are
  // folded away get no marker.
  const marked = topLevel.filter((c) => showResolved || !c.resolved_at);
  // The version open has no comments, but others do: say where they are,
  // so an empty list does not read as "nobody commented".
  const elsewhere =
    versioned && !topLevel.some(onVersion)
      ? versions
          .map((v) => ({
            version: v,
            count: topLevel.filter((c) => c.version_id === v.id).length,
          }))
          .filter(({ count }) => count > 0)
      : [];
  const activeId =
    selectedId ?? activeCommentAt(marked.filter(onVersion), timeMs)?.id ?? null;
  const owner = displayNameOf(track.owner);
  const shareUrl = `${siteUrl()}/t/${track.slug}`;

  // A new comment comes back without a signed picture; it is the viewer's,
  // and theirs is already signed.
  function withOwnAvatar(row: unknown): ThreadComment {
    const comment = row as ThreadComment;
    return {
      ...comment,
      author: {
        ...comment.author,
        avatar_url: viewer?.profile.avatar_url ?? comment.author.avatar_url,
      },
    };
  }

  // Back to this second after signing in.
  function signIn() {
    const back = `${pathname}${timeMs > 0 ? `?t=${Math.floor(timeMs / 1000)}` : ""}`;
    router.push(`/login?next=${encodeURIComponent(back)}`);
  }

  // Signed in without a username yet: whatever they post would carry the
  // made-up one. They pick a name first and come back here, with what
  // they wrote kept.
  const needsName = !!viewer && !viewer.onboarded;
  function pickNameFirst(post?: PendingPost) {
    if (post && viewer) keepPending(track.id, viewer.userId, post);
    const back = `${pathname}${timeMs > 0 ? `?t=${Math.floor(timeMs / 1000)}` : ""}`;
    router.push(`/welcome?next=${encodeURIComponent(back)}`);
  }
  // Leaving for /welcome or /login: the box stays busy until the page has gone.
  const leaving = () => new Promise<SubmitResult>(() => {});

  // The sign-in can end while the page is open (signed out in another tab,
  // or it ran out), and the page still looks signed in. Then a write fails
  // like any other: check, and send them to sign in with what they wrote
  // kept, instead of telling them something broke.
  async function signedOut() {
    try {
      const { data, error } = await (await browserClient()).auth.getSession();
      // An error is something else (no network to renew it with, say).
      return !data.session && !error;
    } catch {
      return false;
    }
  }
  function signInAgain(post?: PendingPost) {
    if (post && viewer) keepPending(track.id, viewer.userId, post);
    toast.message(
      post
        ? "You've been signed out. Sign in again and what you wrote will be waiting."
        : "You've been signed out. Sign in again to carry on.",
    );
    signIn();
  }

  // Back with a name: what they wrote before is put back, ready to post.
  const [kept, setKept] = useState<PendingPost | null>(null);
  const viewerId = viewer?.onboarded ? viewer.userId : null;
  useEffect(() => {
    if (!viewerId) return;
    // After the first paint, so the page renders the same on the server.
    const frame = requestAnimationFrame(() => {
      const post = takePending(track.id, viewerId);
      if (!post) return;
      setKept(post);
      if (post.kind === "comment" && post.timeMs !== null && post.endMs != null)
        setRange({ startMs: post.timeMs, endMs: post.endMs });
      commentsSection.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [track.id, viewerId]);

  async function submit(draft: CommentDraft): Promise<SubmitResult> {
    if (!viewer) return { ok: false, error: "failed" };
    if (needsName) {
      pickNameFirst({ kind: "comment", ...draft });
      return leaving();
    }
    const { data, error } = await (
      await browserClient()
    )
      .from("comments")
      .insert({
        // author_id defaults to the signed in user in the database.
        track_id: track.id,
        body: draft.body,
        category: draft.category,
        time_ms: draft.timeMs,
        ...(draft.endMs != null ? { end_ms: draft.endMs } : {}),
        // Left out, the database uses the latest version.
        ...(versioned && current ? { version_id: current.id } : {}),
      })
      .select(COMMENT_COLUMNS)
      .single();
    if (error) {
      if (handleRequired(error)) {
        pickNameFirst({ kind: "comment", ...draft });
        return leaving();
      }
      if (error.code === "PT429") return { ok: false, error: "rate_limited" };
      if (await signedOut()) {
        signInAgain({ kind: "comment", ...draft });
        return leaving();
      }
      if (error.code === "42501") return { ok: false, error: "unavailable" };
      return { ok: false, error: "failed" };
    }
    setComments((list) => [...list, withOwnAvatar(data)]);
    setPosted((ids) => [...ids, data.id]);
    return { ok: true };
  }

  async function reply(
    parent: ThreadComment,
    body: string,
  ): Promise<SubmitResult> {
    if (!viewer) return { ok: false, error: "failed" };
    if (needsName) {
      pickNameFirst({ kind: "reply", parentId: parent.id, body });
      return leaving();
    }
    const { data, error } = await (
      await browserClient()
    )
      .from("comments")
      .insert({
        // The database puts a reply at its parent's time.
        track_id: track.id,
        parent_id: parent.id,
        body,
        category: parent.category,
      })
      .select(COMMENT_COLUMNS)
      .single();
    if (error) {
      if (handleRequired(error)) {
        pickNameFirst({ kind: "reply", parentId: parent.id, body });
        return leaving();
      }
      if (error.code === "PT429") return { ok: false, error: "rate_limited" };
      if (await signedOut()) {
        signInAgain({ kind: "reply", parentId: parent.id, body });
        return leaving();
      }
      if (error.code === "42501" || error.code === "22023")
        return { ok: false, error: "unavailable" };
      return { ok: false, error: "failed" };
    }
    setComments((list) => [...list, withOwnAvatar(data)]);
    setPosted((ids) => [...ids, data.id]);
    return { ok: true };
  }

  async function editComment(
    comment: ThreadComment,
    body: string,
  ): Promise<SubmitResult> {
    const { data, error } = await (
      await browserClient()
    )
      .from("comments")
      .update({ body })
      .eq("id", comment.id)
      .select("body, edited_at, is_helpful")
      .single();
    if (error) {
      if (error.code === "PT429") return { ok: false, error: "rate_limited" };
      if (error.code === "42501" || error.code === "PGRST116")
        return { ok: false, error: "unavailable" };
      return { ok: false, error: "failed" };
    }
    setComments((list) =>
      list.map((c) => (c.id === comment.id ? { ...c, ...data } : c)),
    );
    return { ok: true };
  }

  async function deleteComment(comment: ThreadComment): Promise<DeleteResult> {
    const { data, error } = await (
      await browserClient()
    ).rpc("delete_comment", { p_comment: comment.id });
    if (error) {
      return error.code === "42501" && /review/i.test(error.details ?? "")
        ? "under_review"
        : "failed";
    }
    setComments((list) =>
      data === "withdrawn"
        ? // Replies keep it in the thread, with nothing of it left.
          list.map((c) =>
            c.id === comment.id
              ? {
                  ...c,
                  status: "withdrawn" as const,
                  body: "",
                  author_id: "",
                  is_helpful: false,
                  author: WITHDRAWN_AUTHOR,
                }
              : c,
          )
        : list.filter((c) => c.id !== comment.id),
    );
    if (selectedId === comment.id) setSelectedId(null);
    toast.success(comment.parent_id ? "Reply deleted." : "Comment deleted.");
    router.refresh();
    return "ok";
  }

  async function toggleResolved(comment: ThreadComment, resolved: boolean) {
    const before = comment.resolved_at ?? null;
    const setResolvedAt = (value: string | null) =>
      setComments((list) =>
        list.map((c) =>
          c.id === comment.id ? { ...c, resolved_at: value } : c,
        ),
      );
    setResolvedAt(resolved ? new Date().toISOString() : null);
    const { data, error } = await (
      await browserClient()
    )
      .from("comments")
      // The server sets the time; any value marks it resolved.
      .update({ resolved_at: resolved ? new Date().toISOString() : null })
      .eq("id", comment.id)
      .select("resolved_at")
      .single();
    if (error) {
      setResolvedAt(before);
      toast.error(
        resolved
          ? "Couldn't mark that as resolved. Try again."
          : "Couldn't reopen that comment. Try again.",
      );
      return;
    }
    setResolvedAt(data.resolved_at);
  }

  async function toggleHelpful(comment: Comment, helpful: boolean) {
    if (needsName) return pickNameFirst();
    setComments((list) =>
      list.map((c) =>
        c.id === comment.id ? { ...c, is_helpful: helpful } : c,
      ),
    );
    const { error } = await (
      await browserClient()
    )
      .from("comments")
      .update({ is_helpful: helpful })
      .eq("id", comment.id);
    if (error) {
      setComments((list) =>
        list.map((c) =>
          c.id === comment.id ? { ...c, is_helpful: !helpful } : c,
        ),
      );
      if (handleRequired(error)) return pickNameFirst();
      if (await signedOut()) return signInAgain();
      toast.error("Couldn't mark that as Helpful. Try again.");
      return;
    }
    if (helpful)
      toast.success(
        `Marked as Helpful. ${displayNameOf(comment.author)} gets credit for it.`,
      );
  }

  // One reaction per person: picking one adds or moves it, null takes it
  // back. Shown at once, undone if the database says no. Writes run in
  // order, so quick clicks cannot land the wrong way round.
  const reactionWrites = useRef(Promise.resolve());
  function pickReaction(next: ReactionKind | null) {
    if (!viewer) return;
    if (needsName) return pickNameFirst();
    const before = mine;
    setMine(next);
    setCounts((c) => moveReaction(c, before, next));
    reactionWrites.current = reactionWrites.current.then(async () => {
      const error = await saveReaction(viewer.userId, before, next).catch(
        () => ({ code: undefined }),
      );
      if (!error) return;
      // Undo this click only; a later one may already have moved on.
      setMine((m) => (m === next ? before : m));
      setCounts((c) => moveReaction(c, next, before));
      if (handleRequired(error)) return pickNameFirst();
      if (error.code !== "PT429" && (await signedOut())) return signInAgain();
      toast.error(
        error.code === "PT429"
          ? "You've reacted a lot in the last hour. Try again in a bit."
          : "Something broke on our side. Try again, or come back in a minute.",
      );
    });
  }

  /** Stores the viewer's reaction. The database's error, or null. */
  async function saveReaction(
    userId: string,
    before: ReactionKind | null,
    next: ReactionKind | null,
  ): Promise<{ code?: string; message?: string } | null> {
    const supabase = await browserClient();
    const reactions = () => supabase.from("reactions");
    const add = async (kind: ReactionKind) =>
      (await reactions().insert({ track_id: track.id, kind })).error;
    const change = async (kind: ReactionKind) => {
      const { data, error } = await reactions()
        .update({ kind })
        .eq("track_id", track.id)
        .eq("user_id", userId)
        .select("kind");
      if (error || data.length > 0) return error;
      // Taken back in another tab: add it again.
      return add(kind);
    };
    if (!next) {
      return (
        await reactions()
          .delete()
          .eq("track_id", track.id)
          .eq("user_id", userId)
      ).error;
    }
    if (before) return change(next);
    const error = await add(next);
    // Already reacted in another tab: change that one instead.
    return error?.code === "23505" ? change(next) : error;
  }

  async function sendReport(report: {
    reason: ReportReason;
    details: string;
  }): Promise<ReportResult> {
    if (!viewer || !reporting) return { ok: false, error: "failed" };
    const { error } = await (await browserClient()).from("reports").insert({
      target_type: reporting.type,
      track_id: reporting.type === "track" ? track.id : null,
      comment_id: reporting.type === "comment" ? reporting.id : null,
      reason: report.reason,
      details: report.details,
    });
    if (error)
      return {
        ok: false,
        error: error.code === "PT429" ? "rate_limited" : "failed",
      };
    return { ok: true };
  }

  async function saveDetails(details: Details): Promise<EditTrackResult> {
    const supabase = await browserClient();
    let genreId: number | undefined;
    if (details.genre !== track.genre.slug) {
      const { data, error } = await supabase
        .from("genres")
        .select("id")
        .eq("slug", details.genre)
        .single();
      if (error) return { ok: false };
      genreId = data.id;
    }
    const { data, error } = await supabase
      .from("tracks")
      .update({
        title: details.title.trim(),
        description: details.description.trim(),
        tags: parseTags(details.tags),
        feedback_wants: details.feedbackWants,
        level: details.level,
        // An empty string clears it.
        reference_url: details.reference.trim(),
        ...(genreId === undefined ? {} : { genre_id: genreId }),
      })
      .eq("id", track.id)
      .select("id");
    if (error || data.length === 0) return { ok: false };
    toast.success("Details saved.");
    router.refresh();
    return { ok: true };
  }

  function pickVersion(id: string) {
    if (id === current?.id) return;
    setPreviousVersionId(current?.id ?? null);
    setVersionId(id);
    setSelectedId(null);
    switchSound(id);
  }

  /**
   * What plays follows the picked version. While playing, the sound fades
   * out first and the new version fades in at the same spot, so switching
   * does not click. The picker and the comments change at once.
   */
  function switchSound(id: string) {
    const mine = ++soundSwitch.current;
    if (!playerPlaying) {
      setSoundVersionId(id);
      return;
    }
    void (player.current?.fadeOut() ?? Promise.resolve()).then(() => {
      if (soundSwitch.current === mine) setSoundVersionId(id);
    });
  }

  function changeShowResolved(next: boolean) {
    setShowResolved(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("resolved", "show");
    else url.searchParams.delete("resolved");
    window.history.replaceState(window.history.state, "", url);
  }

  function changeFilter(next: CommentFilter) {
    setFilter(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("filter");
    else url.searchParams.set("filter", next);
    window.history.replaceState(window.history.state, "", url);
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied.");
    } catch {
      toast.error(
        "Couldn't copy the link. Copy it from the address bar instead.",
      );
    }
  };
  const versionNote =
    versioned && current
      ? { number: current.version_no, of: versions.length }
      : null;

  return (
    <Page as="article">
      {track.status === "hidden" ? (
        <p
          role="status"
          className="mb-6 flex items-start gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
        >
          <EyeOffIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This track is hidden while it is reviewed. Only you and the moderators
          can see it.
        </p>
      ) : null}

      <header>
        <PageTitle className="break-words">{track.title}</PageTitle>
        {/* One grey line: who, what and when. */}
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          <Link
            href={`/u/${track.owner.handle}`}
            className="rounded-xs font-medium text-foreground focus-ring outline-none hover:underline hover:underline-offset-4"
          >
            {owner}
          </Link>
          {" · "}
          <Link
            href={`/feed?tab=latest&genre=${track.genre.slug}`}
            className="rounded-xs focus-ring outline-none hover:text-foreground hover:underline hover:underline-offset-4"
          >
            {track.genre.name}
          </Link>
          {" · "}
          <RelativeTime date={track.published_at} />
        </p>
      </header>

      <div ref={fullPlayer} className="mt-6 scroll-mt-20">
        <WaveformPlayer
          // Its own element once something else plays on the shared one.
          key={carrying ? "carried" : "own"}
          ref={player}
          title={track.title}
          durationMs={playing.durationMs}
          peaks={playing.peaks}
          audioUrl={playing.audioUrl}
          keepPosition
          currentVersionId={versioned ? current?.id : undefined}
          versionNumbers={versioned ? versionNumbers : undefined}
          gainDb={gainDb}
          media={carrying ? () => shared.get() : undefined}
          rangeSelect
          range={range}
          onRangeChange={setRange}
          initialTimeMs={startSeconds * 1000}
          comments={marked}
          activeCommentId={activeId}
          keyboardScope="global"
          onPlayingChange={(on) => {
            setPlayerPlaying(on);
            // A track from "More to hear" stops when this one plays.
            if (on && !carrying) {
              const other = shared.get();
              if (!other.paused) void fadeOutPause(other);
            }
          }}
          onTimeChange={(ms) => {
            setTimeMs(ms);
            setSelectedId(null);
            countPlay(ms);
          }}
          onMarkerSelect={(c) => setSelectedId(c.id)}
          onCommentHere={(ms) =>
            viewer ? composer.current?.focusAt(ms) : signIn()
          }
        />
      </div>

      {pickable.length > 1 && current ? (
        <VersionPicker
          className="mt-4"
          versions={pickable}
          currentId={versionId ?? current.id}
          previousId={previousVersionId}
          onSelect={pickVersion}
        />
      ) : null}

      <ReactionBar
        className="mt-3"
        counts={counts}
        mine={mine}
        signedIn={Boolean(viewer)}
        onSignIn={signIn}
        onPick={pickReaction}
        actions={
          // Everything else about the track, in one place.
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="More for this track"
                title="More"
                className="touch-hit rounded-full text-muted-foreground hover:text-foreground"
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem onSelect={() => void copyLink()}>
                <LinkIcon /> Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowingDetails(true)}>
                <InfoIcon /> Track details
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => player.current?.showShortcuts()}
              >
                <KeyboardIcon /> Keyboard shortcuts
              </DropdownMenuItem>
              {track.status === "live" ? (
                <ExportMarkersSubmenu
                  trackId={track.id}
                  timedCommentCount={
                    // Like the file: live comments with a time.
                    topLevel.filter(
                      (c) =>
                        onVersion(c) &&
                        c.time_ms !== null &&
                        c.status === "live",
                    ).length
                  }
                  hrefFor={(id, format) =>
                    versioned && current
                      ? `${markersHref(id, format)}&version=${current.version_no}`
                      : markersHref(id, format)
                  }
                />
              ) : null}
              {isOwner && genres ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <PencilIcon /> Edit details
                  </DropdownMenuItem>
                  {track.status === "live" ? (
                    <DropdownMenuItem
                      disabled={versions.length >= VERSIONS_MAX}
                      onSelect={() => setAddingVersion(true)}
                    >
                      <UploadIcon />
                      <span className="grid">
                        Upload a new version
                        {versions.length >= VERSIONS_MAX ? (
                          <span className="text-xs text-muted-foreground">
                            A track can have up to {VERSIONS_MAX} versions.
                          </span>
                        ) : null}
                      </span>
                    </DropdownMenuItem>
                  ) : null}
                  {track.status === "live" ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDeleting(true)}
                    >
                      <Trash2Icon /> Delete track
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : viewer && !isOwner ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setReporting({ type: "track" })}
                  >
                    <FlagIcon /> Report track
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <TrackDetailsDialog
        track={track}
        version={versionNote}
        open={showingDetails}
        onOpenChange={setShowingDetails}
      />

      <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_19rem] xl:gap-16">
        <div className="min-w-0">
          {/* The artist's own words, short on a phone. The rest of the
              facts are a tap away there, and in the column on the right
              on wide screens. */}
          {track.description ? (
            <p
              className={cn(
                "max-w-prose text-[15px] leading-relaxed break-words whitespace-pre-line",
                !showingMore && "line-clamp-2 lg:line-clamp-none",
              )}
            >
              {track.description}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setShowingMore((open) => !open)}
            aria-expanded={showingMore}
            className="touch-hit mt-1 rounded-xs text-[13px] text-muted-foreground focus-ring outline-none hover:text-foreground lg:hidden"
          >
            {showingMore ? "Less" : "More about this track"}
          </button>
          {showingMore ? (
            <TrackFacts
              track={track}
              version={versionNote}
              className="mt-4 lg:hidden"
            />
          ) : null}

          {/* Opened from the menu next to the reactions. */}
          {isOwner ? (
            <DeleteTrackDialog
              track={deleting ? track : null}
              onClose={() => setDeleting(false)}
              onDeleted={() => router.push(`/u/${track.owner.handle}`)}
            />
          ) : null}
          {isOwner && genres ? (
            <EditTrackDialog
              track={track}
              genres={genres}
              open={editing}
              onOpenChange={setEditing}
              onSave={saveDetails}
            />
          ) : null}
          {addingVersion ? (
            <NewVersion
              trackId={track.id}
              trackTitle={track.title}
              versionCount={versions.length}
              onClose={() => setAddingVersion(false)}
              // The page under the dialog switches while it says the version
              // is live, so closing it moves nothing.
              onLive={(version) => {
                setNewVersion(version);
                setPreviousVersionId(current?.id ?? null);
                setVersionId(version.id);
                switchSound(version.id);
                router.refresh();
              }}
              onPublished={() => {}}
            />
          ) : null}
          {viewer && !isOwner ? (
            <ReportDialog
              target="track"
              trigger={null}
              open={reporting?.type === "track"}
              onOpenChange={(open) =>
                setReporting(open ? { type: "track" } : null)
              }
              onSubmit={sendReport}
            />
          ) : null}

          <MiniPlayerBar
            title={track.title}
            visible={scrolledPast}
            playing={playerPlaying}
            timeMs={timeMs}
            durationMs={playing.durationMs}
            markerTimes={marked
              .filter((c) => onVersion(c) && c.time_ms !== null)
              .map((c) => c.time_ms!)}
            onToggle={() =>
              playerPlaying ? player.current?.pause() : player.current?.play()
            }
            onExpand={() =>
              fullPlayer.current?.scrollIntoView({ behavior: "smooth" })
            }
          />

          {/* Cards link here (#comments). The heading lands below the
              header and the slim player bar (56 and 64 pixels). */}
          <section
            ref={commentsSection}
            id="comments"
            aria-labelledby="comments-heading"
            // Without a note, level with the column on the right.
            className={cn(
              "mt-8 scroll-mt-[8.5rem]",
              !track.description && "lg:mt-0",
            )}
          >
            <CommentList
              heading={{
                id: "comments-heading",
                text: "Comments",
                count: commentCount,
              }}
              composer={
                <CommentComposer
                  // A kept comment starts the box over with it in.
                  key={kept?.kind === "comment" ? "kept" : "new"}
                  initialBody={kept?.kind === "comment" ? kept.body : undefined}
                  initialDraft={kept?.kind === "comment" ? kept : undefined}
                  ref={composer}
                  avatar={
                    viewer ? (
                      <UserAvatar
                        profile={viewer.profile}
                        size="sm"
                        anonymous={!viewer.onboarded}
                      />
                    ) : undefined
                  }
                  currentTimeMs={timeMs}
                  durationMs={playing.durationMs}
                  range={range}
                  onClearRange={() => setRange(null)}
                  signedIn={Boolean(viewer)}
                  commentsPerHour={viewer?.commentsPerHour}
                  onSubmit={submit}
                  onSignIn={signIn}
                />
              }
              initialReply={kept?.kind === "reply" ? kept : null}
              comments={listed}
              newCommentIds={posted}
              // This version has none, an earlier one has: say where they are,
              // in place of the usual empty state.
              emptyAll={
                elsewhere.length > 0 ? (
                  <div
                    role="note"
                    className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed p-4 text-sm"
                  >
                    <span className="text-muted-foreground">
                      No comments on this version yet.
                    </span>
                    {elsewhere.map(({ version, count }) => (
                      <Button
                        key={version.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => pickVersion(version.id)}
                      >
                        {count} {count === 1 ? "comment" : "comments"} on
                        version {version.version_no}
                      </Button>
                    ))}
                  </div>
                ) : undefined
              }
              viewer={viewerKind}
              ownerId={track.owner_id}
              authorBadges={authorBadges}
              activeCommentId={activeId}
              filter={filter}
              onFilterChange={changeFilter}
              showResolved={showResolved}
              onShowResolvedChange={changeShowResolved}
              onReply={reply}
              viewerId={viewer?.userId}
              isAdmin={viewer?.isAdmin ?? false}
              onEdit={viewer ? editComment : undefined}
              onDelete={viewer ? deleteComment : undefined}
              onToggleResolved={(c, resolved) =>
                void toggleResolved(c, resolved)
              }
              onJump={(c) => {
                // The time on a comment plays from there: that is what people
                // click it for.
                if (c.time_ms !== null) {
                  player.current?.seekTo(c.time_ms);
                  player.current?.play();
                }
                setSelectedId(c.id);
              }}
              onToggleHelpful={(c, helpful) => void toggleHelpful(c, helpful)}
              onReport={(c) => setReporting({ type: "comment", id: c.id })}
              onSignIn={signIn}
              onCopyLink={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  toast.success("Link copied.");
                } catch {
                  toast.error(
                    "Couldn't copy the link. Copy it from the address bar instead.",
                  );
                }
              }}
            />
            <ReportDialog
              target="comment"
              trigger={null}
              open={reporting?.type === "comment"}
              onOpenChange={(open) => {
                if (!open) setReporting(null);
              }}
              onSubmit={sendReport}
            />
          </section>
          {/* On a phone: after the comments, where reading ends. */}
          <MoreToHear
            tracks={moreToHear}
            beforePlay={stepAside}
            className="mt-12 lg:hidden"
          />
        </div>
        <aside className="hidden lg:block" aria-label="About this track">
          {/* Below the top bar and the slim player bar (56 and 64 pixels),
              so nothing slides under them. */}
          <div className="sticky top-[8.5rem] grid grid-cols-[minmax(0,1fr)] gap-10">
            <TrackFacts track={track} version={versionNote} short />
            <MoreToHear tracks={moreToHear} beforePlay={stepAside} />
          </div>
        </aside>
      </div>
    </Page>
  );
}

/** The track's own version, when it has more than one. */
type VersionNote = { number: number; of: number } | null;

/**
 * What helps someone give good feedback: what the artist wants to hear
 * about, the reference track and the version. With `short` off (on a
 * phone, behind "More about this track") the experience and the tags too.
 */
function TrackFacts({
  track,
  version,
  short = false,
  className,
}: {
  track: Track;
  version: VersionNote;
  short?: boolean;
  className?: string;
}) {
  const wants = track.feedback_wants.map((w) =>
    FEEDBACK_WANT_LABELS[w].toLowerCase(),
  );
  return (
    <div className={cn("grid gap-3 text-sm text-muted-foreground", className)}>
      {wants.length > 0 ? (
        <p>
          Wants feedback on{" "}
          <span className="text-foreground">
            {wants.length > 1
              ? `${wants.slice(0, -1).join(", ")} and ${wants.at(-1)}`
              : wants[0]}
          </span>
        </p>
      ) : null}
      {!short && track.level ? (
        <p>{LEVEL_DISPLAY_LABELS[track.level]}</p>
      ) : null}
      {!short && track.tags.length > 0 ? <p>{track.tags.join(" · ")}</p> : null}
      {track.reference_url ? <ReferenceLink url={track.reference_url} /> : null}
      {version ? (
        <p>
          Version {version.number} of {version.of}
        </p>
      ) : null}
    </div>
  );
}

/** From the track's menu: the facts that are not on the page. */
function TrackDetailsDialog({
  track,
  version,
  open,
  onOpenChange,
}: {
  track: Track;
  version: VersionNote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rows: (readonly [string, React.ReactNode])[] = [
    ...(track.level
      ? ([["Experience", LEVEL_DISPLAY_LABELS[track.level]]] as const)
      : []),
    ...(track.tags.length > 0
      ? ([["Tags", track.tags.join(" · ")]] as const)
      : []),
    ...(track.feedback_wants.length > 0
      ? ([
          [
            "Wants feedback on",
            track.feedback_wants.map((w) => FEEDBACK_WANT_LABELS[w]).join(", "),
          ],
        ] as const)
      : []),
    ...(version
      ? ([["Version", `${version.number} of ${version.of}`]] as const)
      : []),
    [
      "Plays",
      track.play_count > 0 ? formatPlays(track.play_count) : "None yet",
    ],
    ["Published", <RelativeTime key="published" date={track.published_at} />],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Track details</DialogTitle>
          <DialogDescription className="sr-only">
            About {track.title}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
        {track.reference_url ? (
          <ReferenceLink url={track.reference_url} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A quiet next step for someone looking around: five tracks with play,
 * title and artist. Played on the site's shared player, like the feed.
 * Streamed in after the page; with nothing to offer, nothing shows.
 */
function MoreToHear({
  tracks,
  beforePlay,
  className,
}: {
  tracks: Promise<CardTrack[]>;
  beforePlay: () => Promise<void> | void;
  className?: string;
}) {
  return (
    <Suspense fallback={null}>
      <MoreToHearList
        tracks={tracks}
        beforePlay={beforePlay}
        className={className}
      />
    </Suspense>
  );
}

function MoreToHearList({
  tracks,
  beforePlay,
  className,
}: {
  tracks: Promise<CardTrack[]>;
  beforePlay: () => Promise<void> | void;
  className?: string;
}) {
  const list = use(tracks);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="more-to-hear" className={className}>
      <h2 id="more-to-hear" className="text-sm font-semibold">
        More to hear
      </h2>
      <TrackList
        tracks={list}
        label="More to hear"
        variant="compact"
        beforePlay={beforePlay}
        className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1"
      />
    </section>
  );
}
