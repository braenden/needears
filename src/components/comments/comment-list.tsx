"use client";

import { createContext, useContext, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUpIcon,
  CheckIcon,
  CircleCheckIcon,
  EllipsisIcon,
  FlagIcon,
  Loader2Icon,
  PencilIcon,
  ReplyIcon,
  RotateCcwIcon,
  ThumbsUpIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react";

import { RelativeTime } from "@/components/common/relative-time";
import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/empty-state";
import { BadgeIcons, type BadgeKind } from "@/components/profile/badges";
import { ReputationBadge } from "@/components/reputation-badge";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABELS } from "@/config/labels";
import { COMMENT_MAX } from "@/config/limits";
import { isTrusted } from "@/config/reputation";
import { formatSpan } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Comment, RangeComment, ThreadComment } from "@/types/view";

import type { SubmitResult } from "./comment-composer";
import { ReplyComposer } from "./reply-composer";

export type CommentFilter = "all" | "helpful" | "trusted";

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
  defaultShowResolved = true,
  onShowResolvedChange,
  viewerId,
  isAdmin = false,
  onEdit,
  onDelete,
  initialReply,
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
  const resolvedCount = present.filter(
    (c) => c.resolved_at && !isWithdrawn(c),
  ).length;
  // A deleted comment is not hidden as resolved: its replies would go with
  // it, and nothing would say where.
  const shown = showResolved
    ? present
    : present.filter((c) => !c.resolved_at || isWithdrawn(c));
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
  const filters: [CommentFilter, string][] = [
    ["all", "All"],
    ["helpful", "Helpful"],
    ["trusted", "From trusted ears"],
  ];

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
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as CommentFilter)}
            className="gap-0"
          >
            <div className="flex items-end justify-between gap-3 border-b">
              <TabsList
                variant="line"
                aria-label="Filter comments"
                className="min-w-0 border-b-0"
              >
                {filters.map(([value, label]) => (
                  <TabsTrigger key={value} value={value}>
                    {label}
                    <span
                      data-numeric
                      className="text-xs text-muted-foreground"
                    >
                      {counts[value]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mb-1 shrink-0 text-muted-foreground"
                  >
                    <ArrowDownUpIcon />
                    <span className="hidden @sm:inline">
                      {sort === "time" ? "By time" : "Newest"}
                    </span>
                    <span className="sr-only @sm:hidden">Sort comments</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort comments</DropdownMenuLabel>
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {resolvedCount > 0 ? (
              <div className="flex justify-end pt-2">
                <label className="touch-hit inline-flex min-h-8 cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    checked={showResolved}
                    onChange={(e) => {
                      setShowResolvedState(e.target.checked);
                      onShowResolvedChange?.(e.target.checked);
                    }}
                    className="size-4 accent-(--primary)"
                  />
                  Show resolved
                  <span data-numeric>({resolvedCount})</span>
                </label>
              </div>
            ) : null}

            {filters.map(([value]) => (
              <TabsContent key={value} value={value}>
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
                    <ol className="divide-y">
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
                              fromOwner={
                                !!ownerId && comment.author_id === ownerId
                              }
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
                      <div className="flex justify-center border-t pt-4">
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
              </TabsContent>
            ))}
          </Tabs>
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
  fromOwner,
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
  fromOwner: boolean;
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
  const canResolve = viewer === "owner" && !!onToggleResolved;

  const profileHref = `/u/${comment.author.handle}`;
  return (
    <li
      className={cn(
        "relative flex gap-3 py-4",
        newCommentIds.includes(comment.id) &&
          "-mx-3 animate-comment-in rounded-lg px-3",
      )}
    >
      {/* The name next to it is the link for keyboard and screen readers. */}
      <Link
        href={profileHref}
        tabIndex={-1}
        aria-hidden="true"
        className="mt-0.5 shrink-0 self-start rounded-full"
      >
        <UserAvatar
          profile={comment.author}
          className={cn(resolved && "grayscale")}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <CommentHeader
          comment={comment}
          viewer={viewer}
          onReport={onReport}
          onEditStart={() => setEditing(true)}
          muted={resolved}
          fromOwner={fromOwner}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {comment.time_ms !== null ? (
            <button
              type="button"
              onClick={() => onJump?.(comment)}
              className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2 text-xs font-medium text-primary-text focus-ring outline-none hover:bg-[color-mix(in_oklab,var(--primary-soft),var(--primary)_14%)]"
              aria-label={`Play from ${formatSpan(comment.time_ms, (comment as RangeComment).end_ms)}`}
            >
              <time data-numeric>
                {formatSpan(comment.time_ms, (comment as RangeComment).end_ms)}
              </time>
            </button>
          ) : (
            <Badge variant="secondary" className="h-6 px-2">
              Whole track
            </Badge>
          )}
          <Badge variant="outline" className="h-6 px-2">
            {CATEGORY_LABELS[comment.category]}
          </Badge>
          {comment.is_helpful ? (
            <Badge variant="default" className="h-6 px-2">
              <CheckIcon /> Helpful
            </Badge>
          ) : null}
          {resolved ? (
            <Badge variant="secondary" className="h-6 px-2">
              <CircleCheckIcon /> Resolved
            </Badge>
          ) : null}
        </div>
        {editing && onEdit ? (
          <CommentEditor
            comment={comment}
            onSave={(body) => onEdit(comment, body)}
            onClose={() => setEditing(false)}
          />
        ) : (
          <p
            className={cn(
              "mt-2 text-sm leading-relaxed break-words whitespace-pre-line",
              resolved && "text-muted-foreground",
            )}
          >
            {comment.body}
          </p>
        )}

        {viewer === "owner" || onReply ? (
          <div className="mt-2 -ml-2 flex flex-wrap items-center gap-1">
            {onReply && !replying ? (
              <Button
                ref={replyButton}
                type="button"
                variant="ghost"
                size="xs"
                onClick={() =>
                  viewer === "signed_out" ? onSignIn?.() : setReplying(true)
                }
                className="touch-hit text-muted-foreground"
              >
                <ReplyIcon />
                {viewer === "signed_out" ? "Sign in to reply" : "Reply"}
              </Button>
            ) : null}
            {viewer === "owner" ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onToggleHelpful?.(comment, !comment.is_helpful)}
                className="touch-hit text-muted-foreground"
              >
                {comment.is_helpful ? <UndoIcon /> : <ThumbsUpIcon />}
                {comment.is_helpful ? "Remove Helpful" : "Mark as Helpful"}
              </Button>
            ) : null}
            {canResolve ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onToggleResolved(comment, !resolved)}
                className="touch-hit text-muted-foreground"
              >
                {resolved ? <RotateCcwIcon /> : <CircleCheckIcon />}
                {resolved ? "Reopen" : "Mark as resolved"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {replies.length > 0 || replying ? (
          // One column that may shrink: a grid track is otherwise as wide as
          // its longest name or link, and pushes the page sideways.
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 border-l-2 pl-3 @sm:pl-4">
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

function CommentHeader({
  comment,
  viewer,
  onReport,
  onEditStart,
  muted,
  fromOwner,
}: {
  comment: ThreadComment;
  viewer: Viewer;
  onReport?: (comment: Comment) => void;
  onEditStart?: () => void;
  muted?: boolean;
  fromOwner?: boolean;
}) {
  const { viewerId, isAdmin, onEdit, askDelete } = useContext(Actions);
  const own = !!viewerId && comment.author_id === viewerId;
  const canEdit = own && !!onEdit && !!onEditStart;
  const canDelete = (own || isAdmin) && !!askDelete;
  const name = displayNameOf(comment.author);
  const profileHref = `/u/${comment.author.handle}`;
  const badges = useContext(AuthorBadges)[comment.author_id] ?? [];
  return (
    <div className="flex items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {/* Display names are not unique, so the handle and the Uploader
            badge show who is really speaking. */}
        <Link
          href={profileHref}
          className="group/author flex min-w-0 items-baseline gap-1.5 rounded-xs focus-ring outline-none"
        >
          {/* Only the name is underlined on hover, not the handle. */}
          <span
            className={cn(
              "truncate text-sm font-semibold group-hover/author:underline",
              muted && "text-muted-foreground",
            )}
          >
            {name}
          </span>
          {/* Narrow: name, time and one badge. The rest is on the profile. */}
          <span className="hidden truncate text-xs text-muted-foreground @sm:block">
            @{comment.author.handle}
          </span>
        </Link>
        {fromOwner ? (
          <Badge variant="solid" className="h-5 px-2 text-[11px]">
            Uploader
          </Badge>
        ) : null}
        <ReputationBadge
          helpful={comment.author.reputation}
          className={fromOwner ? "hidden @sm:inline-flex" : undefined}
        />
        <BadgeIcons badges={badges} className="hidden @sm:flex" />
        <RelativeTime
          date={comment.created_at}
          className="text-xs text-muted-foreground"
        />
        {comment.edited_at ? (
          <span className="text-xs text-muted-foreground">edited</span>
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
              className="touch-hit -mt-1 -mr-1.5 shrink-0 text-muted-foreground"
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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

/** A reply: no time, category or Helpful, just who said what. */
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
      <Link
        href={`/u/${reply.author.handle}`}
        tabIndex={-1}
        aria-hidden="true"
        className="mt-0.5 shrink-0 self-start rounded-full"
      >
        <UserAvatar
          profile={reply.author}
          size="sm"
          className={cn(muted && "grayscale")}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <CommentHeader
          comment={reply}
          viewer={viewer}
          fromOwner={fromOwner}
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
              "mt-1 text-sm leading-relaxed break-words whitespace-pre-line",
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
    <li className="flex gap-3 py-4">
      <span
        aria-hidden="true"
        className="mt-0.5 size-8 shrink-0 rounded-full border border-dashed"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground italic">Comment deleted</p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 border-l-2 pl-3 @sm:pl-4">
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
