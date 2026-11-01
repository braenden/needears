"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  EllipsisIcon,
  EyeOffIcon,
  FlagIcon,
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
} from "@/components/comments/comment-list";
import { RelativeTime } from "@/components/common/relative-time";
import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { MiniPlayerBar } from "@/components/player/mini-player-bar";
import { useSharedAudio } from "@/components/player/shared-audio";
import {
  type TimeRange,
  WaveformPlayer,
  type WaveformPlayerHandle,
} from "@/components/player/waveform-player";
import { moveReaction, ReactionBar } from "@/components/reaction-bar";
import { ReportDialog, type ReportResult } from "@/components/report-dialog";
import { ReputationBadge } from "@/components/reputation-badge";
import type { EditTrackResult } from "@/components/track/edit-track-dialog";
import {
  ExportMarkersSubmenu,
  markersHref,
} from "@/components/track/export-markers-menu";
import { DeleteTrackDialog } from "@/components/track/delete-track-dialog";
import { ReferenceLink } from "@/components/track/reference-link";
import { VersionPicker } from "@/components/versions/version-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Details } from "@/components/upload/upload-state";
import type { BadgeKind } from "@/components/profile/badges";
import type { PlayableVersion } from "@/lib/data/tracks";
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
} from "@/types/view";

const COMMENT_COLUMNS =
  "id, track_id, author_id, parent_id, version_id, time_ms, end_ms, category, body, is_helpful, status, resolved_at, created_at, author:profiles!comments_author_id_fkey(id, handle, display_name, avatar_url, reputation)";

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
  const [previousVersionId, setPreviousVersionId] = useState<string | null>(
    null,
  );
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
  const carrying = !!carriedSrc && audioUrl === firstAudioUrl;
  useEffect(() => {
    if (!carriedSrc) return;
    shared.claim(audioOwner, { id: track.id, slug: track.slug });
    return () => shared.release(audioOwner);
  }, [shared, audioOwner, carriedSrc, track.id, track.slug]);
  const [reporting, setReporting] = useState<
    { type: "track" } | { type: "comment"; id: string } | null
  >(null);

  const isOwner = viewer?.userId === track.owner_id;
  // With more than one version, the player, the markers and the list follow
  // the picked version. Until a new version arrives from the server after
  // publishing, the latest one plays.
  const versioned = versions.length > 1;
  const current = versions.find((v) => v.id === versionId) ?? latest;
  const isLatest = !current || current.id === latest?.id;
  const playing = {
    durationMs: current?.duration_ms ?? track.duration_ms,
    peaks: current?.peaks ?? track.peaks,
    // The latest version's URL is refreshed when it expires.
    audioUrl: isLatest
      ? carrying
        ? carriedSrc
        : audioUrl
      : (current?.audioUrl ?? null),
  };
  const measured = versions
    .map((v) => v.loudness)
    .filter((l): l is number => l !== null);
  const gainDb = versioned
    ? matchGainDb(
        current?.loudness ?? null,
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
  const topLevel = comments.filter((c) => !c.parent_id);
  const listed = comments.filter(onVersion);
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
    selectedId ??
    activeCommentAt(topLevel.filter(onVersion), timeMs)?.id ??
    null;
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

  async function submit(draft: CommentDraft): Promise<SubmitResult> {
    if (!viewer) return { ok: false, error: "failed" };
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
      if (error.code === "PT429") return { ok: false, error: "rate_limited" };
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
      if (error.code === "PT429") return { ok: false, error: "rate_limited" };
      if (error.code === "42501" || error.code === "22023")
        return { ok: false, error: "unavailable" };
      return { ok: false, error: "failed" };
    }
    setComments((list) => [...list, withOwnAvatar(data)]);
    setPosted((ids) => [...ids, data.id]);
    return { ok: true };
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
  ): Promise<{ code?: string } | null> {
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
  }

  function changeShowResolved(next: boolean) {
    setShowResolved(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.delete("resolved");
    else url.searchParams.set("resolved", "hide");
    window.history.replaceState(window.history.state, "", url);
  }

  function changeFilter(next: CommentFilter) {
    setFilter(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("filter");
    else url.searchParams.set("filter", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
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
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-tight break-words sm:text-4xl">
          {track.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <Link
            href={`/u/${track.owner.handle}`}
            className="group/owner flex items-center gap-2 rounded-md text-foreground focus-ring outline-none"
          >
            <UserAvatar profile={track.owner} size="sm" />
            {/* Only the name is underlined on hover. */}
            <span className="group-hover/owner:underline">{owner}</span>
          </Link>
          <ReputationBadge helpful={track.owner.reputation} />
          <Link
            href={`/feed?tab=latest&genre=${track.genre.slug}`}
            className="rounded-xs focus-ring outline-none hover:text-foreground hover:underline"
          >
            {track.genre.name}
          </Link>
          <RelativeTime date={track.published_at} />
          {track.play_count > 0 ? (
            <span data-numeric>{formatPlays(track.play_count)}</span>
          ) : null}
        </div>
      </header>

      {versioned && current ? (
        <VersionPicker
          className="mt-6"
          versions={versions}
          currentId={current.id}
          previousId={previousVersionId}
          onSelect={pickVersion}
        />
      ) : null}

      <div ref={fullPlayer} className="mt-6 scroll-mt-20">
        <WaveformPlayer
          ref={player}
          title={track.title}
          durationMs={playing.durationMs}
          peaks={playing.peaks}
          audioUrl={playing.audioUrl}
          keepPosition
          currentVersionId={versioned ? current?.id : undefined}
          versionNumbers={versioned ? versionNumbers : undefined}
          gainDb={gainDb}
          media={carriedSrc ? () => shared.get() : undefined}
          rangeSelect
          range={range}
          onRangeChange={setRange}
          initialTimeMs={startSeconds * 1000}
          comments={topLevel}
          activeCommentId={activeId}
          keyboardScope="global"
          onPlayingChange={setPlayerPlaying}
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

      <ReactionBar
        className="mt-4"
        counts={counts}
        mine={mine}
        signedIn={Boolean(viewer)}
        shareUrl={shareUrl}
        onSignIn={signIn}
        onPick={pickReaction}
        actions={
          // Everything else about the track, in one place: the owner's
          // changes, or a report for anyone else signed in.
          track.status === "live" || (isOwner && genres) || viewer ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="More for this track"
                  className="touch-hit rounded-full"
                >
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
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
                  <DropdownMenuItem
                    onSelect={() => setReporting({ type: "track" })}
                  >
                    <FlagIcon /> Report track
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />

      <section aria-label="About this track" className="mt-6 grid gap-3">
        {track.description ? (
          <p className="max-w-prose text-[15px] leading-relaxed break-words whitespace-pre-line">
            {track.description}
          </p>
        ) : null}
        {track.reference_url ? (
          <ReferenceLink url={track.reference_url} />
        ) : null}
        <dl className="grid gap-1 text-sm">
          {track.feedback_wants.length > 0 ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Wants feedback on</dt>
              <dd>
                {track.feedback_wants
                  .map((w) => FEEDBACK_WANT_LABELS[w])
                  .join(", ")}
              </dd>
            </div>
          ) : null}
          {track.level ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Experience</dt>
              <dd>{LEVEL_DISPLAY_LABELS[track.level]}</dd>
            </div>
          ) : null}
        </dl>
        {track.tags.length > 0 ? (
          <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
            {track.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="outline">{tag}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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
          onPublished={(version) => {
            setPreviousVersionId(current?.id ?? null);
            setVersionId(version.id);
            router.refresh();
          }}
        />
      ) : null}
      {viewer && !isOwner ? (
        <ReportDialog
          target="track"
          trigger={null}
          open={reporting?.type === "track"}
          onOpenChange={(open) => setReporting(open ? { type: "track" } : null)}
          onSubmit={sendReport}
        />
      ) : null}

      <MiniPlayerBar
        title={track.title}
        visible={scrolledPast}
        playing={playerPlaying}
        timeMs={timeMs}
        durationMs={playing.durationMs}
        markerTimes={topLevel
          .filter((c) => onVersion(c) && c.time_ms !== null)
          .map((c) => c.time_ms!)}
        onToggle={() =>
          playerPlaying ? player.current?.pause() : player.current?.play()
        }
        onExpand={() =>
          fullPlayer.current?.scrollIntoView({ behavior: "smooth" })
        }
      />

      {/* Cards link here (#comments). The heading lands below the header,
          and on phones below the slim player bar too (64 pixels). */}
      <section
        ref={commentsSection}
        id="comments"
        aria-labelledby="comments-heading"
        className="mt-10 scroll-mt-[8.5rem] sm:scroll-mt-20"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2
            id="comments-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Comments
          </h2>
        </div>
        <CommentComposer
          ref={composer}
          currentTimeMs={timeMs}
          durationMs={playing.durationMs}
          range={range}
          onClearRange={() => setRange(null)}
          signedIn={Boolean(viewer)}
          commentsPerHour={viewer?.commentsPerHour}
          onSubmit={submit}
          onSignIn={signIn}
        />
        <CommentList
          className="mt-6"
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
                    {count} {count === 1 ? "comment" : "comments"} on version{" "}
                    {version.version_no}
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
          onToggleResolved={(c, resolved) => void toggleResolved(c, resolved)}
          onJump={(c) => {
            if (c.time_ms !== null) player.current?.seekTo(c.time_ms);
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
    </article>
  );
}
