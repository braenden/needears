"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { loadFeedPage } from "@/app/actions/feed";
import { TrackCardSkeleton } from "@/components/track/track-card";
import { type PlayableTrack, TrackList } from "@/components/track/track-list";
import { Button } from "@/components/ui/button";

/**
 * Infinite scroll on top of the server rendered page. Loading more appends
 * the next page and writes its number to the URL, so a reload or a shared
 * link lands on that page. The button works without scrolling (keyboard,
 * reduced motion); the observer just presses it early.
 */
export function FeedList({
  initial,
  initialHasMore,
  tab,
  genre,
  page,
  label,
}: {
  initial: PlayableTrack[];
  initialHasMore: boolean;
  tab: string;
  genre: string | null;
  page: number;
  label: string;
}) {
  const [tracks, setTracks] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [lastPage, setLastPage] = useState(page);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  function loadMore() {
    if (pending || !hasMore) return;
    const next = lastPage + 1;
    startTransition(async () => {
      try {
        const result = await loadFeedPage(tab, genre, next);
        setTracks((list) => {
          const seen = new Set(list.map((t) => t.id));
          return [...list, ...result.tracks.filter((t) => !seen.has(t.id))];
        });
        setHasMore(result.hasMore);
        setLastPage(next);
        setFailed(false);
        const url = new URL(window.location.href);
        url.searchParams.set("page", String(next));
        window.history.replaceState(window.history.state, "", url);
      } catch {
        setFailed(true);
      }
    });
  }

  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore]);

  return (
    <>
      <TrackList tracks={tracks} label={label} className="grid gap-3" />
      {pending ? (
        <div className="mt-3 grid gap-3">
          <TrackCardSkeleton />
          <TrackCardSkeleton />
        </div>
      ) : null}
      <div ref={sentinel} className="mt-6 flex flex-col items-center gap-2">
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            Something broke on our side. Try again, or come back in a minute.
          </p>
        ) : null}
        {hasMore ? (
          <Button variant="outline" onClick={loadMore} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            Load more
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            That&apos;s everything for now.
          </p>
        )}
      </div>
    </>
  );
}
