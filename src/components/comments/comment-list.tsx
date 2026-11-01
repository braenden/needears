"use client";

import { createContext, useContext, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUpIcon,
  CheckIcon,
  CircleCheckIcon,
  EllipsisIcon,
  FlagIcon,
  ReplyIcon,
  RotateCcwIcon,
  ThumbsUpIcon,
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
import { CATEGORY_LABELS } from "@/config/labels";
import { isTrusted } from "@/config/reputation";
import { formatSpan } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Comment, RangeComment, ThreadComment } from "@/types/view";

import type { SubmitResult } from "./comment-composer";
import { ReplyComposer } from "./reply-composer";

export type CommentFilter = "all" | "helpful" | "trusted";
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

export function CommentList({
  comments,
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
  className,
}: {
  /** Top-level comments and replies together. Replies have parent_id set. */
  comments: ThreadComment[];
  viewer: Viewer;
  /** The track owner. Their comments get an Uploader badge. */
  ownerId?: string;
  /** Badges per author id, shown as small icons next to the name. */
  authorBadges?: Record<string, BadgeKind[]>;
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
  className?: string;
}) {
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
  const resolvedCount = top.filter((c) => c.resolved_at).length;
  const shown = showResolved ? top : top.filter((c) => !c.resolved_at);
  const counts: Record<CommentFilter, number> = {
    all: shown.length,
    helpful: filterComments(shown, "helpful").length,
    trusted: filterComments(shown, "trusted").length,
  };
  const visible = sortComments(filterComments(shown, filter), sort);
  const filters: [CommentFilter, string][] = [
    ["all", "All"],
    ["helpful", "Helpful"],
    ["trusted", "From trusted ears"],
  ];

  return (
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
                  <span data-numeric className="text-xs text-muted-foreground">
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
              ) : visible.length === 0 ? (
                <CommentsEmpty
                  filter={filter}
                  viewer={viewer}
                  onShowAll={() => setFilter("all")}
                  onSignIn={onSignIn}
                  onCopyLink={onCopyLink}
                />
              ) : (
                <ol className="divide-y">
                  {visible.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      viewer={viewer}
                      fromOwner={!!ownerId && comment.author_id === ownerId}
                      ownerId={ownerId}
                      active={comment.id === activeCommentId}
                      onJump={onJump}
                      onToggleHelpful={onToggleHelpful}
                      onReport={onReport}
                      replies={replies.get(comment.id) ?? []}
                      onReply={onReply}
                      onToggleResolved={onToggleResolved}
                      onSignIn={onSignIn}
                    />
                  ))}
                </ol>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AuthorBadges>
  );
}

function CommentItem({
  comment,
  viewer,
  fromOwner,
  ownerId,
  active,
  onJump,
  onToggleHelpful,
  onReport,
  replies,
  onReply,
  onToggleResolved,
  onSignIn,
}: {
  comment: ThreadComment;
  viewer: Viewer;
  fromOwner: boolean;
  ownerId?: string;
  active: boolean;
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
  const [replying, setReplying] = useState(false);
  const replyButton = useRef<HTMLButtonElement>(null);
  const canResolve = viewer === "owner" && !!onToggleResolved;

  const profileHref = `/u/${comment.author.handle}`;
  return (
    <li
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex gap-3 py-4 transition-colors duration-(--duration-base)",
        active &&
          "before:absolute before:inset-y-2 before:-left-3 before:w-0.5 before:rounded-full before:bg-primary",
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
          muted={resolved}
          fromOwner={fromOwner}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {comment.time_ms !== null ? (
            <button
              type="button"
              onClick={() => onJump?.(comment)}
              className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2 text-xs font-medium text-primary-text focus-ring outline-none hover:bg-[color-mix(in_oklab,var(--primary-soft),var(--primary)_14%)]"
              aria-label={`Jump to ${formatSpan(comment.time_ms, (comment as RangeComment).end_ms)}`}
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
        <p
          className={cn(
            "mt-2 text-sm leading-relaxed break-words whitespace-pre-line",
            resolved && "text-muted-foreground",
          )}
        >
          {comment.body}
        </p>

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
                    onReport={onReport}
                    muted={resolved}
                  />
                ))}
              </ol>
            ) : null}
            {replying && onReply ? (
              <ReplyComposer
                parentName={name}
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
  muted,
  fromOwner,
}: {
  comment: Comment;
  viewer: Viewer;
  onReport?: (comment: Comment) => void;
  muted?: boolean;
  fromOwner?: boolean;
}) {
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
          className="flex min-w-0 items-baseline gap-1.5 rounded-xs focus-ring outline-none hover:underline"
        >
          <span
            className={cn(
              "truncate text-sm font-semibold",
              muted && "text-muted-foreground",
            )}
          >
            {name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            @{comment.author.handle}
          </span>
        </Link>
        {fromOwner ? (
          <Badge variant="solid" className="h-5 px-2 text-[11px]">
            Uploader
          </Badge>
        ) : null}
        <ReputationBadge helpful={comment.author.reputation} />
        <BadgeIcons badges={badges} />
        <RelativeTime
          date={comment.created_at}
          className="text-xs text-muted-foreground"
        />
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
            <DropdownMenuItem onSelect={() => onReport?.(comment)}>
              <FlagIcon /> Report comment
            </DropdownMenuItem>
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
  onReport,
  muted,
}: {
  reply: ThreadComment;
  viewer: Viewer;
  fromOwner: boolean;
  onReport?: (comment: Comment) => void;
  muted?: boolean;
}) {
  return (
    <li className="flex gap-2.5">
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
          muted={muted}
        />
        <p
          className={cn(
            "mt-1 text-sm leading-relaxed break-words whitespace-pre-line",
            muted && "text-muted-foreground",
          )}
        >
          {reply.body}
        </p>
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
      body="Be the first to say what you hear. Click the waveform or press C to comment at the current second."
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
