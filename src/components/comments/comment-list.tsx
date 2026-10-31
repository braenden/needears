"use client";

import { useState } from "react";
import {
  ArrowDownUpIcon,
  CheckIcon,
  EllipsisIcon,
  FlagIcon,
  ThumbsUpIcon,
  UndoIcon,
} from "lucide-react";

import { RelativeTime } from "@/components/common/relative-time";
import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/empty-state";
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
import type { Comment, RangeComment } from "@/types/view";

export type CommentFilter = "all" | "helpful" | "trusted";
export type CommentSort = "time" | "newest";

export function filterComments(comments: Comment[], filter: CommentFilter) {
  if (filter === "helpful") return comments.filter((c) => c.is_helpful);
  if (filter === "trusted")
    return comments.filter((c) => isTrusted(c.author.reputation));
  return comments;
}

export function sortComments(comments: Comment[], sort: CommentSort) {
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

type Viewer = "owner" | "visitor" | "signed_out";

export function CommentList({
  comments,
  viewer,
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
  className,
}: {
  comments: Comment[];
  viewer: Viewer;
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
  className?: string;
}) {
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

  const counts: Record<CommentFilter, number> = {
    all: comments.length,
    helpful: filterComments(comments, "helpful").length,
    trusted: filterComments(comments, "trusted").length,
  };
  const visible = sortComments(filterComments(comments, filter), sort);
  const filters: [CommentFilter, string][] = [
    ["all", "All"],
    ["helpful", "Helpful"],
    ["trusted", "From trusted ears"],
  ];

  return (
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

        {filters.map(([value]) => (
          <TabsContent
            key={value}
            value={value}
            className="focus-visible:ring-offset-2"
          >
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
                    active={comment.id === activeCommentId}
                    onJump={onJump}
                    onToggleHelpful={onToggleHelpful}
                    onReport={onReport}
                  />
                ))}
              </ol>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CommentItem({
  comment,
  viewer,
  active,
  onJump,
  onToggleHelpful,
  onReport,
}: {
  comment: Comment;
  viewer: Viewer;
  active: boolean;
  onJump?: (comment: Comment) => void;
  onToggleHelpful?: (comment: Comment, helpful: boolean) => void;
  onReport?: (comment: Comment) => void;
}) {
  const name = displayNameOf(comment.author);
  return (
    <li
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex gap-3 py-4 transition-colors duration-(--duration-base)",
        active &&
          "before:absolute before:inset-y-2 before:-left-3 before:w-0.5 before:rounded-full before:bg-primary",
      )}
    >
      <UserAvatar profile={comment.author} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold">{name}</span>
            <ReputationBadge helpful={comment.author.reputation} />
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
                  className="-mt-1 -mr-1.5 shrink-0 text-muted-foreground"
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
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {comment.time_ms !== null ? (
            <button
              type="button"
              onClick={() => onJump?.(comment)}
              className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2 text-xs font-medium text-primary-text outline-none hover:bg-[color-mix(in_oklab,var(--primary-soft),var(--primary)_14%)] focus-visible:ring-2 focus-visible:ring-ring"
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
        </div>
        <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line">
          {comment.body}
        </p>
        {viewer === "owner" ? (
          <div className="mt-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onToggleHelpful?.(comment, !comment.is_helpful)}
              className="-ml-2 text-muted-foreground"
            >
              {comment.is_helpful ? <UndoIcon /> : <ThumbsUpIcon />}
              {comment.is_helpful ? "Remove Helpful" : "Mark as Helpful"}
            </Button>
          </div>
        ) : null}
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
