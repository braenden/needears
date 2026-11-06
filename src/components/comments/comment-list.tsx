"use client";

import { createContext, useContext, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  EllipsisIcon,
  FlagIcon,
  Loader2Icon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";

import { RelativeTime } from "@/components/common/relative-time";
import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/empty-state";
import { BadgeIcons, type BadgeKind } from "@/components/profile/badges";
import { ReputationBadge } from "@/components/reputation-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX } from "@/config/limits";
import { isTrusted } from "@/config/reputation";
import { formatSpan } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Comment, RangeComment, ThreadComment } from "@/types/view";

import type { SubmitResult } from "./comment-composer";
import { ReplyComposer } from "./reply-composer";

export type CommentFilter = "all" | "helpful" | "trusted";

const FILTER_LABELS: Record<CommentFilter, string> = {
  all: "All",
  helpful: "Helpful",
  trusted: "From trusted ears",
};

/**
 * Deleted by its author while it had replies: it keeps its place so the
 * replies keep theirs, with nothing of the comment left.
 */
export function isWithdrawn(comment: Pick<Comment, "status">) {
  return comment.status === "withdrawn";
}

/** How deleting a comment went. */
export type DeleteResult = "ok" | "under_review" | "failed";
export type CommentSort = "time" | "newest";

export function filterComments<T extends Comment>(
  comments: T[],
  filter: CommentFilter,
) {
  if (filter === "helpful") return comments.filter((c) => c.is_helpful);
  if (filter === "trusted")
    return comments.filter((c) => isTrusted(c.author.reputation));
  return comments;
}

export function sortComments<T extends Comment>(
  comments: T[],
  sort: CommentSort,
) {
  const copy = [...comments];
  if (sort === "newest") {
    return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  // Whole-track comments first, then in playback order.
  return copy.sort((a, b) => (a.time_ms ?? -1) - (b.time_ms ?? -1));
}

/** The comment that was most recently passed by the playhead. */
export function activeCommentAt(comments: Comment[], timeMs: number) {
  let active: Comment | null = null;
  for (const c of comments) {
    if (
      c.time_ms !== null &&
      c.time_ms <= timeMs &&
      (!active || c.time_ms >= (active.time_ms ?? 0))
    ) {
      active = c;
    }
  }
  return active;
}

/**
 * Splits a flat list into top-level comments and replies grouped by parent,
 * replies oldest first. Replies to a comment that is not in the list are
 * dropped, since there is nothing to hang them under.
 */
export function threadComments<T extends ThreadComment>(comments: T[]) {
  const top = comments.filter((c) => !c.parent_id);
  const ids = new Set(top.map((c) => c.id));
  const replies = new Map<string, T[]>();
  for (const c of comments) {
    if (!c.parent_id || !ids.has(c.parent_id)) continue;
    const list = replies.get(c.parent_id) ?? [];
    list.push(c);
    replies.set(c.parent_id, list);
  }
  for (const list of replies.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return { top, replies };
}

type Viewer = "owner" | "visitor" | "signed_out";

// Badges per author id, read by every comment and reply header.
const AuthorBadges = createContext<Record<string, BadgeKind[]>>({});

// Who is looking, and what they can do to a comment of their own.
const Actions = createContext<{
  viewerId?: string;
  isAdmin: boolean;
  onEdit?: (comment: ThreadComment, body: string) => Promise<SubmitResult>;
  askDelete?: (comment: ThreadComment) => void;
}>({ isAdmin: false });

/** Comments drawn at first, and how many more each press shows. */
const COMMENTS_PAGE = 30;

export function CommentList({
  comments,
  newCommentIds = [],
  emptyAll,
  viewer,
  ownerId,
  authorBadges = {},
  activeCommentId,
  defaultFilter = "all",
  defaultSort = "time",
  filter: filterProp,
  onFilterChange,
  sort: sortProp,
  onSortChange,
  loading = false,
  onJump,
  onToggleHelpful,
  onReport,
  onSignIn,
  onCopyLink,
  onReply,
  onToggleResolved,
  showResolved: showResolvedProp,
  defaultShowResolved = false,
  onShowResolvedChange,
  viewerId,
  isAdmin = false,
  onEdit,
  onDelete,
  initialReply,
  heading,
  composer,
  className,
}: {
  /** Top-level comments and replies together. Replies have parent_id set. */
  comments: ThreadComment[];
  /** Just posted: they come in with a short glow. */
  newCommentIds?: string[];
  /** In place of the usual empty state of All, such as where else to look. */
  emptyAll?: React.ReactNode;
  viewer: Viewer;
  /** The track owner. Their comments get an Uploader badge. */
  ownerId?: string;
  /** Badges per author id, shown as small icons next to the name. */
  authorBadges?: Record<string, BadgeKind[]>;
  /**
   * The comment playing or picked on the waveform. Not marked in the list;
   * only drawn, however far down it is.
   */
  activeCommentId?: string | null;
  defaultFilter?: CommentFilter;
  defaultSort?: CommentSort;
  /** Controlled filter, for example from a ?filter= search param. */
  filter?: CommentFilter;
  onFilterChange?: (filter: CommentFilter) => void;
  sort?: CommentSort;
  onSortChange?: (sort: CommentSort) => void;
  loading?: boolean;
  onJump?: (comment: Comment) => void;
  onToggleHelpful?: (comment: Comment, helpful: boolean) => void;
  onReport?: (comment: Comment) => void;
  onSignIn?: () => void;
  onCopyLink?: () => void;
  /** Shows Reply on top-level comments. Signed-out viewers get onSignIn instead. */
  onReply?: (parent: ThreadComment, body: string) => Promise<SubmitResult>;
  /** Owner only: resolve or reopen a top-level comment. */
  onToggleResolved?: (comment: ThreadComment, resolved: boolean) => void;
  showResolved?: boolean;
  defaultShowResolved?: boolean;
  onShowResolvedChange?: (show: boolean) => void;
  /** The signed in person: their own comments get Edit and Delete. */
  viewerId?: string;
  /** Admins can delete anyone's comment. */
  isAdmin?: boolean;
  onEdit?: (comment: ThreadComment, body: string) => Promise<SubmitResult>;
  onDelete?: (comment: ThreadComment) => Promise<DeleteResult>;
  /** The list's heading, with the count beside it. */
  heading?: { id: string; text: string };
  /** The box to write a comment in, between the heading and the list. */
  composer?: React.ReactNode;
  /** A kept reply coming back: its box opens with the text in it. */
  initialReply?: { parentId: string; body: string } | null;
  className?: string;
}) {
  const [deleting, setDeleting] = useState<ThreadComment | null>(null);
  const [showResolvedState, setShowResolvedState] =
    useState(defaultShowResolved);
  const showResolved = showResolvedProp ?? showResolvedState;
  const [filterState, setFilterState] = useState<CommentFilter>(defaultFilter);
  const [sortState, setSortState] = useState<CommentSort>(defaultSort);
  const filter = filterProp ?? filterState;
  const sort = sortProp ?? sortState;
  const setFilter = (next: CommentFilter) => {
    setFilterState(next);
    onFilterChange?.(next);
  };
  const setSort = (next: CommentSort) => {
    setSortState(next);
    onSortChange?.(next);
  };

  const { top, replies } = threadComments(comments);
  // A deleted comment stays only while there are replies to hold together,
  // and it counts nowhere.
  const present = top.filter(
    (c) => !isWithdrawn(c) || (replies.get(c.id)?.length ?? 0) > 0,
  );
  // A resolved thread stays resolved when its top comment was deleted, so
  // it is counted here and "Show resolved" brings it back.
  const resolvedCount = present.filter((c) => c.resolved_at).length;
  const shown = showResolved ? present : present.filter((c) => !c.resolved_at);
  const counts: Record<CommentFilter, number> = {
    all: shown.filter((c) => !isWithdrawn(c)).length,
    helpful: filterComments(shown, "helpful").length,
    trusted: filterComments(shown, "trusted").length,
  };
  const visible = sortComments(filterComments(shown, filter), sort);
  // A busy track draws its comments 30 at a time, but always far enough
  // to include the one playing or picked on the waveform.
  const [limit, setLimit] = useState(COMMENTS_PAGE);
  const activeIndex = visible.findIndex((c) => c.id === activeCommentId);
  const upTo = Math.max(limit, activeIndex + 1);
  const remaining = visible.length - upTo;
  const total = present.filter((c) => !isWithdrawn(c)).length;
  const changeShowResolved = (next: boolean) => {
    setShowResolvedState(next);
    onShowResolvedChange?.(next);
  };

  return (
    <Actions
      value={{
        viewerId,
        isAdmin,
        onEdit,
        askDelete: onDelete ? setDeleting : undefined,
      }}
    >
      <AuthorBadges value={authorBadges}>
        <div className={cn("@container", className)}>
          <div className="flex items-end justify-between gap-3 border-b pb-2">
            {heading ? (
              <h2 id={heading.id} className="text-lg font-semibold">
                {heading.text}{" "}
                <span
                  data-numeric
                  className="font-normal text-muted-foreground"
                >
                  {total}
                </span>
              </h2>
            ) : (
              <span />
            )}
            {/* Order, which comments, and the resolved ones: one menu. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mb-1 shrink-0 gap-1 px-1.5 text-[13px] font-normal text-muted-foreground"
                >
                  <span className="sr-only">Comments: </span>
                  {filter !== "all" ? `${FILTER_LABELS[filter]} · ` : ""}
                  {sort === "time" ? "By time" : "Newest"}
                  <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel>Order</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(v) => setSort(v as CommentSort)}
                >
                  <DropdownMenuRadioItem value="time">
                    By time in the track
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="newest">
                    Newest first
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Show</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={filter}
                  onValueChange={(v) => setFilter(v as CommentFilter)}
                >
                  {(Object.keys(FILTER_LABELS) as CommentFilter[]).map(
                    (value) => (
                      <DropdownMenuRadioItem key={value} value={value}>
                        {FILTER_LABELS[value]}
                        <span
                          data-numeric
                          className="ml-auto pl-3 text-xs text-muted-foreground"
                        >
                          {counts[value]}
                        </span>
                      </DropdownMenuRadioItem>
                    ),
                  )}
                </DropdownMenuRadioGroup>
                {resolvedCount > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={showResolved}
                      onCheckedChange={(checked) =>
                        changeShowResolved(checked === true)
                      }
                    >
                      Show resolved
                      <span
                        data-numeric
                        className="ml-auto pl-3 text-xs text-muted-foreground"
                      >
                        {resolvedCount}
                      </span>
                    </DropdownMenuCheckboxItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {composer ? <div className="mt-4">{composer}</div> : null}

          <div className="mt-6">
            {loading ? (
              <CommentListSkeleton />
            ) : visible.length === 0 && filter === "all" && emptyAll ? (
              emptyAll
            ) : visible.length === 0 ? (
              <CommentsEmpty
                filter={filter}
                viewer={viewer}
                onShowAll={() => setFilter("all")}
                onSignIn={onSignIn}
                onCopyLink={onCopyLink}
              />
            ) : (
              <>
                {/* No lines between the threads: space does it. */}
                <ol
                  aria-label="Comments"
                  className="grid grid-cols-[minmax(0,1fr)] gap-7"
                >
                  {visible
                    .slice(0, upTo)
                    .map((comment) =>
                      isWithdrawn(comment) ? (
                        <WithdrawnItem
                          key={comment.id}
                          replies={replies.get(comment.id) ?? []}
                          viewer={viewer}
                          ownerId={ownerId}
                          newCommentIds={newCommentIds}
                          onReport={onReport}
                        />
                      ) : (
                        <CommentItem
                          key={
                            initialReply?.parentId === comment.id
                              ? `${comment.id}-kept`
                              : comment.id
                          }
                          initialReplyBody={
                            initialReply?.parentId === comment.id
                              ? initialReply.body
                              : undefined
                          }
                          comment={comment}
                          viewer={viewer}
                          ownerId={ownerId}
                          newCommentIds={newCommentIds}
                          onJump={onJump}
                          onToggleHelpful={onToggleHelpful}
                          onReport={onReport}
                          replies={replies.get(comment.id) ?? []}
                          onReply={onReply}
                          onToggleResolved={onToggleResolved}
                          onSignIn={onSignIn}
                        />
                      ),
                    )}
                </ol>
                {remaining > 0 ? (
                  <div className="mt-6 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLimit(upTo + COMMENTS_PAGE)}
                    >
                      Show {Math.min(COMMENTS_PAGE, remaining)} more
                    </Button>
                  </div>
                ) : null}
              </>
            )}
            {/* The resolved ones wait at the bottom, a tap away. */}
            {resolvedCount > 0 ? (
              <button
                type="button"
                aria-expanded={showResolved}
                onClick={() => changeShowResolved(!showResolved)}
                className="mt-4 -ml-1.5 inline-flex h-7 items-center rounded-md px-1.5 text-[13px] text-muted-foreground focus-ring outline-none hover:text-foreground"
              >
                {showResolved
                  ? "Hide resolved comments"
                  : `${resolvedCount} resolved ${resolvedCount === 1 ? "comment" : "comments"}`}
              </button>
            ) : null}
          </div>
        </div>
        {onDelete ? (
          <DeleteCommentDialog
            comment={deleting}
            onClose={() => setDeleting(null)}
            onDelete={onDelete}
          />
        ) : null}
      </AuthorBadges>
    </Actions>
  );
}

function CommentItem({
  comment,
  viewer,
  ownerId,
  newCommentIds,
  onJump,
  onToggleHelpful,
  onReport,
  replies,
  onReply,
  onToggleResolved,
  onSignIn,
  initialReplyBody,
}: {
  comment: ThreadComment;
  initialReplyBody?: string;
  viewer: Viewer;
  ownerId?: string;
  newCommentIds: string[];
  onJump?: (comment: Comment) => void;
  onToggleHelpful?: (comment: Comment, helpful: boolean) => void;
  onReport?: (comment: Comment) => void;
  replies: ThreadComment[];
  onReply?: (parent: ThreadComment, body: string) => Promise<SubmitResult>;
  onToggleResolved?: (comment: ThreadComment, resolved: boolean) => void;
  onSignIn?: () => void;
}) {
  const name = displayNameOf(comment.author);
  const resolved = !!comment.resolved_at;
  const [replying, setReplying] = useState(initialReplyBody !== undefined);
  const [editing, setEditing] = useState(false);
  const { onEdit } = useContext(Actions);
  const replyButton = useRef<HTMLButtonElement>(null);
  const span =
    comment.time_ms !== null
      ? formatSpan(comment.time_ms, (comment as RangeComment).end_ms)
      : null;

  return (
    <li
      className={cn(
        "relative flex gap-3",
        newCommentIds.includes(comment.id) &&
          "-mx-3 animate-comment-in rounded-lg px-3",
      )}
    >
      <Avatar profile={comment.author} muted={resolved} />
      <div className="min-w-0 flex-1">
        <CommentHeader
          comment={comment}
          viewer={viewer}
          onReport={onReport}
          onEditStart={() => setEditing(true)}
          muted={resolved}
          onToggleResolved={viewer === "owner" ? onToggleResolved : undefined}
        />
        {editing && onEdit ? (
          <CommentEditor
            comment={comment}
            onSave={(body) => onEdit(comment, body)}
            onClose={() => setEditing(false)}
          />
        ) : (
          <p
            className={cn(
              "mt-1 text-[15px] leading-relaxed break-words whitespace-pre-line",
              resolved && "text-muted-foreground",
            )}
          >
            {/* The time plays from there. */}
            {span ? (
              <button
                type="button"
                onClick={() => onJump?.(comment)}
                aria-label={`Play from ${span}`}
                className="mr-1.5 rounded-xs font-medium text-primary-text focus-ring outline-none hover:underline hover:underline-offset-4"
              >
                <time data-numeric>{span}</time>
              </button>
            ) : null}
            {comment.body}
          </p>
        )}

        {viewer === "owner" || onReply ? (
          <div className="mt-1 -ml-1.5 flex flex-wrap items-center gap-1">
            {onReply && !replying ? (
              <button
                ref={replyButton}
                type="button"
                onClick={() =>
                  viewer === "signed_out" ? onSignIn?.() : setReplying(true)
                }
                className={ACTION}
              >
                {viewer === "signed_out" ? "Sign in to reply" : "Reply"}
              </button>
            ) : null}
            {/* The artist marks a comment Helpful with one tap. */}
            {viewer === "owner" ? (
              <button
                type="button"
                aria-pressed={comment.is_helpful}
                title={
                  comment.is_helpful ? "Remove Helpful" : "Mark as Helpful"
                }
                onClick={() => onToggleHelpful?.(comment, !comment.is_helpful)}
                className={cn(
                  ACTION,
                  comment.is_helpful &&
                    "text-primary-text hover:text-primary-text",
                )}
              >
                Helpful
              </button>
            ) : null}
          </div>
        ) : null}

        {replies.length > 0 || replying ? (
          // A thin line down from the comment, close to it. One column
          // that may shrink: a grid track is otherwise as wide as its
          // longest name or link, and pushes the page sideways.
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 border-l pl-4">
            {replies.length > 0 ? (
              <ol
                aria-label={`Replies to ${name}`}
                className="grid grid-cols-[minmax(0,1fr)] gap-3"
              >
                {replies.map((reply) => (
                  <ReplyItem
                    key={reply.id}
                    reply={reply}
                    viewer={viewer}
                    fromOwner={!!ownerId && reply.author_id === ownerId}
                    fresh={newCommentIds.includes(reply.id)}
                    onReport={onReport}
                    muted={resolved}
                  />
                ))}
              </ol>
            ) : null}
            {replying && onReply ? (
              <ReplyComposer
                parentName={name}
                initialBody={initialReplyBody}
                onSubmit={(body) => onReply(comment, body)}
                onClose={() => {
                  setReplying(false);
                  // Back to where the person was, so the list does not lose focus.
                  requestAnimationFrame(() => replyButton.current?.focus());
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Quiet text buttons under a comment. */
const ACTION =
  "touch-hit inline-flex h-7 items-center rounded-md px-1.5 text-[13px] text-muted-foreground focus-ring outline-none hover:text-foreground";

/** The author's picture, which goes to their profile. */
function Avatar({
  profile,
  muted,
}: {
  profile: Comment["author"];
  muted?: boolean;
}) {
  return (
    // The name beside it is the link for keyboard and screen readers.
    <Link
      href={`/u/${profile.handle}`}
      tabIndex={-1}
      aria-hidden="true"
      className="mt-0.5 shrink-0 self-start rounded-full"
    >
      <UserAvatar
        profile={profile}
        size="sm"
        className={cn(muted && "grayscale")}
      />
    </Link>
  );
}

/**
 * Who, when, and the menu: the name, the grey time, "Helpful" in blue
 * when the artist marked it, and "Artist" on the artist's own replies.
 */
function CommentHeader({
  comment,
  viewer,
  onReport,
  onEditStart,
  onToggleResolved,
  muted,
  fromArtist = false,
}: {
  comment: ThreadComment;
  viewer: Viewer;
  onReport?: (comment: Comment) => void;
  onEditStart?: () => void;
  /** The artist resolves or reopens a thread from the menu. */
  onToggleResolved?: (comment: ThreadComment, resolved: boolean) => void;
  muted?: boolean;
  fromArtist?: boolean;
}) {
  const { viewerId, isAdmin, onEdit, askDelete } = useContext(Actions);
  const own = !!viewerId && comment.author_id === viewerId;
  const canEdit = own && !!onEdit && !!onEditStart;
  const canDelete = (own || isAdmin) && !!askDelete;
  const name = displayNameOf(comment.author);
  const resolved = !!comment.resolved_at;
  const badges = useContext(AuthorBadges)[comment.author_id] ?? [];
  return (
    <div className="flex items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-sm">
        <Link
          href={`/u/${comment.author.handle}`}
          className={cn(
            "truncate rounded-xs font-semibold focus-ring outline-none hover:underline hover:underline-offset-4",
            muted && "text-muted-foreground",
          )}
        >
          {name}
        </Link>
        {/* Only the levels worth knowing: Trusted and Golden ears. */}
        {isTrusted(comment.author.reputation) ? (
          <ReputationBadge helpful={comment.author.reputation} />
        ) : null}
        <BadgeIcons badges={badges} className="hidden @sm:flex" />
        <span className="text-muted-foreground">
          {fromArtist ? "· Artist " : ""}·{" "}
          <RelativeTime date={comment.created_at} />
          {comment.edited_at ? " · edited" : ""}
        </span>
        {comment.is_helpful ? (
          <span className="text-primary-text">· Helpful</span>
        ) : null}
      </div>
      {viewer !== "signed_out" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`More actions for the comment by ${name}`}
              title="More"
              className="touch-hit -mt-0.5 -mr-1.5 shrink-0 text-muted-foreground"
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onToggleResolved ? (
              <DropdownMenuItem
                onSelect={() => onToggleResolved(comment, !resolved)}
              >
                {resolved ? <RotateCcwIcon /> : <CircleCheckIcon />}
                {resolved ? "Reopen" : "Mark as resolved"}
              </DropdownMenuItem>
            ) : null}
            {canEdit ? (
              <DropdownMenuItem onSelect={onEditStart}>
                <PencilIcon /> Edit
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => askDelete?.(comment)}
              >
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            ) : null}
            {/* Nobody reports their own. */}
            {!own ? (
              <DropdownMenuItem onSelect={() => onReport?.(comment)}>
                <FlagIcon /> Report comment
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/** A reply: no time, type or Helpful, just who said what. */
function ReplyItem({
  reply,
  viewer,
  fromOwner,
  fresh,
  onReport,
  muted,
}: {
  reply: ThreadComment;
  viewer: Viewer;
  fromOwner: boolean;
  fresh: boolean;
  onReport?: (comment: Comment) => void;
  muted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { onEdit } = useContext(Actions);
  return (
    <li
      className={cn(
        "flex gap-2.5",
        fresh && "-mx-2 animate-comment-in rounded-lg px-2 py-1",
      )}
    >
      <Avatar profile={reply.author} muted={muted} />
      <div className="min-w-0 flex-1">
        <CommentHeader
          comment={reply}
          viewer={viewer}
          fromArtist={fromOwner}
          onReport={onReport}
          onEditStart={() => setEditing(true)}
          muted={muted}
        />
        {editing && onEdit ? (
          <CommentEditor
            comment={reply}
            onSave={(body) => onEdit(reply, body)}
            onClose={() => setEditing(false)}
          />
        ) : (
          <p
            className={cn(
              "mt-1 text-[15px] leading-relaxed break-words whitespace-pre-line",
              muted && "text-muted-foreground",
            )}
          >
            {reply.body}
          </p>
        )}
      </div>
    </li>
  );
}

function CommentsEmpty({
  filter,
  viewer,
  onShowAll,
  onSignIn,
  onCopyLink,
}: {
  filter: CommentFilter;
  viewer: Viewer;
  onShowAll: () => void;
  onSignIn?: () => void;
  onCopyLink?: () => void;
}) {
  if (filter !== "all") {
    return (
      <EmptyState
        size="compact"
        title={
          filter === "helpful"
            ? "No Helpful comments yet."
            : "Nothing from trusted ears yet."
        }
        action={
          <Button variant="outline" size="sm" onClick={onShowAll}>
            Show all
          </Button>
        }
      />
    );
  }
  if (viewer === "owner") {
    return (
      <EmptyState
        size="compact"
        title="No comments yet."
        body="Share the link to get ears on it."
        action={
          <Button variant="outline" size="sm" onClick={onCopyLink}>
            Copy link
          </Button>
        }
      />
    );
  }
  if (viewer === "signed_out") {
    return (
      <EmptyState
        size="compact"
        title="Quiet in here."
        body="Listen, then sign in to leave the first comment."
        action={
          <Button size="sm" onClick={onSignIn}>
            Sign in to comment
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      size="compact"
      title="Quiet in here."
      body={
        <>
          Be the first to say what you hear.{" "}
          {/* The C key only with a keyboard and mouse. */}
          <span className="fine:hidden">Tap</span>
          <span className="hidden fine:inline">Click</span> the waveform
          <span className="hidden fine:inline"> or press C</span> to comment at
          the current second.
        </>
      }
    />
  );
}

function CommentListSkeleton() {
  return (
    <div className="divide-y" role="status" aria-label="Loading comments">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 py-4">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Asks before a comment goes; it cannot be brought back. */
function DeleteCommentDialog({
  comment,
  onClose,
  onDelete,
}: {
  comment: ThreadComment | null;
  onClose: () => void;
  onDelete: (comment: ThreadComment) => Promise<DeleteResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DeleteResult | null>(null);
  const isReply = !!comment?.parent_id;
  return (
    <Dialog
      open={!!comment}
      onOpenChange={(open) => {
        if (open || busy) return;
        setError(null);
        onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isReply ? "Delete reply?" : "Delete comment?"}
          </DialogTitle>
          <DialogDescription>
            It goes for good.
            {!isReply
              ? " Replies to it stay, under \u201cComment deleted\u201d."
              : ""}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error === "under_review"
              ? "This comment is being looked at by a moderator, so it can't be deleted right now."
              : "Couldn't delete it. Try again."}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setError(null);
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              if (!comment) return;
              setBusy(true);
              const result = await onDelete(comment).catch(
                () => "failed" as const,
              );
              setBusy(false);
              if (result === "ok") {
                setError(null);
                onClose();
              } else setError(result);
            }}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Your own comment or reply, in place, with the same limits as writing it. */
function CommentEditor({
  comment,
  onSave,
  onClose,
}: {
  comment: ThreadComment;
  onSave: (body: string) => Promise<SubmitResult>;
  onClose: () => void;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const problem = (text: string) =>
    !text.trim()
      ? "Write something first."
      : text.trim().length > COMMENT_MAX
        ? `Comments can be up to ${COMMENT_MAX} characters.`
        : null;

  async function save() {
    if (saving) return;
    const issue = problem(body);
    if (issue) {
      setError(issue);
      textarea.current?.focus();
      return;
    }
    if (body.trim() === comment.body) {
      onClose();
      return;
    }
    setSaving(true);
    const result = await onSave(body.trim()).catch(
      () => ({ ok: false, error: "failed" }) as const,
    );
    setSaving(false);
    if (result.ok) onClose();
    else
      setError(
        result.error === "unavailable"
          ? "This comment can't be changed right now."
          : "Your change didn't go through. Your text is still here. Try again.",
      );
  }

  return (
    <form
      noValidate
      className="mt-2 grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={`${id}-body`} className="sr-only">
        Edit your comment
      </label>
      <Textarea
        ref={textarea}
        id={`${id}-body`}
        // The person just pressed Edit.
        autoFocus
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError(problem(e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${id}-error` : comment.is_helpful ? `${id}-note` : undefined
        }
        className="min-h-16 bg-background"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="mr-auto min-h-5 text-sm">
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-destructive">
              {error}
            </p>
          ) : comment.is_helpful ? (
            <p id={`${id}-note`} className="text-muted-foreground">
              A changed comment loses its Helpful mark.
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={saving}
          aria-keyshortcuts="Meta+Enter Control+Enter"
        >
          {saving ? <Loader2Icon className="animate-spin" /> : null}
          Save
        </Button>
      </div>
    </form>
  );
}

/**
 * A comment its author deleted while it had replies: no name, no text, no
 * actions. Only there to hold the replies.
 */
function WithdrawnItem({
  replies,
  viewer,
  ownerId,
  newCommentIds,
  onReport,
}: {
  replies: ThreadComment[];
  viewer: Viewer;
  ownerId?: string;
  newCommentIds: string[];
  onReport?: (comment: Comment) => void;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 size-6 shrink-0 rounded-full border border-dashed"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground italic">Comment deleted</p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 border-l pl-4">
          <ol
            aria-label="Replies to a deleted comment"
            className="grid grid-cols-[minmax(0,1fr)] gap-3"
          >
            {replies.map((reply) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                viewer={viewer}
                fromOwner={!!ownerId && reply.author_id === ownerId}
                fresh={newCommentIds.includes(reply.id)}
                onReport={onReport}
              />
            ))}
          </ol>
        </div>
      </div>
    </li>
  );
}
