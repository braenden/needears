import type { Metadata } from "next";
import Link from "next/link";
import { SlidingUnderline } from "@/components/common/sliding-underline";
import { ChevronUpIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getGenres } from "@/lib/data/profiles";
import { clampPage } from "@/lib/data/parse";
import { FEED_TABS, type FeedTab, getFeed } from "@/lib/data/tracks";
import { getViewer } from "@/lib/data/viewer";
import { cn } from "@/lib/utils";
import { FeedList } from "./feed-list";
import { GenreFilter } from "./genre-filter";
import { Page } from "@/components/shell/page";

const TAB_LABELS: Record<FeedTab, string> = {
  "needs-ears": "Needs ears",
  latest: "Latest",
  trending: "Trending",
};

export async function generateMetadata({
  searchParams,
}: PageProps<"/feed">): Promise<Metadata> {
  const params = await searchParams;
  const tab = FEED_TABS.find((t) => t === params.tab);
  return {
    title: tab ? `${TAB_LABELS[tab]} tracks` : "Feed",
    description: "Tracks from producers who want honest, timestamped feedback.",
    alternates: { canonical: "/feed" },
  };
}

function feedHref(tab: FeedTab, genre: string | null, page = 1) {
  const params = new URLSearchParams({ tab });
  if (genre) params.set("genre", genre);
  if (page > 1) params.set("page", String(page));
  return `/feed?${params}`;
}

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const [params, viewer, genres] = await Promise.all([
    searchParams,
    getViewer(),
    getGenres(),
  ]);
  const tab: FeedTab =
    FEED_TABS.find((t) => t === params.tab) ??
    (viewer ? "needs-ears" : "latest");
  const genre = genres.find((g) => g.slug === params.genre) ?? null;
  const page = clampPage(params.page);
  const { tracks, hasMore } = await getFeed(tab, genre?.slug ?? null, page);

  return (
    // The tracks, and nothing else: the tabs on top, the genre beside
    // them, and a row per track.
    <Page>
      <h1 className="sr-only">Feed</h1>
      <div className="flex items-end justify-between gap-3 border-b">
        <nav
          aria-label="Feed tabs"
          className="relative min-w-0 [scrollbar-width:none] overflow-x-auto"
        >
          <ul className="-mb-px flex gap-5 whitespace-nowrap">
            {FEED_TABS.map((t) => (
              <li key={t}>
                <Link
                  href={feedHref(t, genre?.slug ?? null)}
                  aria-current={t === tab ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 items-center border-b-2 border-transparent text-[15px] whitespace-nowrap text-muted-foreground focus-ring outline-none hover:text-foreground",
                    "aria-[current=page]:border-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground in-data-[underline=ready]:aria-[current=page]:border-transparent",
                  )}
                >
                  {TAB_LABELS[t]}
                </Link>
              </li>
            ))}
          </ul>
          <SlidingUnderline
            selector='[aria-current="page"]'
            className="-bottom-px bg-foreground"
          />
        </nav>
        <GenreFilter genres={genres} value={genre?.slug ?? ""} tab={tab} />
      </div>
      <div>
        <h2 className="sr-only">
          {TAB_LABELS[tab]}
          {genre ? `, ${genre.name}` : ""}
        </h2>
        {page > 1 ? (
          <Button asChild variant="ghost" size="sm" className="mt-4">
            <Link href={feedHref(tab, genre?.slug ?? null)}>
              <ChevronUpIcon /> Back to the top
            </Link>
          </Button>
        ) : null}
        {tracks.length === 0 ? (
          <FeedEmpty tab={tab} genreName={genre?.name ?? null} page={page} />
        ) : (
          <FeedList
            key={`${tab}-${genre?.slug ?? ""}-${page}`}
            initial={tracks}
            initialHasMore={hasMore}
            tab={tab}
            genre={genre?.slug ?? null}
            page={page}
            label={`${TAB_LABELS[tab]}${genre ? `, ${genre.name}` : ""}`}
          />
        )}
      </div>
    </Page>
  );
}

function FeedEmpty({
  tab,
  genreName,
  page,
}: {
  tab: FeedTab;
  genreName: string | null;
  page: number;
}) {
  const upload = (
    <Button asChild>
      <Link href="/upload">Upload a track</Link>
    </Button>
  );
  if (page > 1) return <EmptyState title="That's everything for now." />;
  if (genreName)
    return (
      <EmptyState
        title={`Nothing in ${genreName} yet.`}
        body="Be the first, or try another genre."
        action={upload}
      />
    );
  if (tab === "needs-ears")
    return (
      <EmptyState
        title="Every track has ears right now."
        body="Nice. Have a listen to what's new."
        action={
          <Button asChild variant="outline">
            <Link href="/feed?tab=latest">Go to Latest</Link>
          </Button>
        }
      />
    );
  // Trending only holds tracks with comments or reactions from the last
  // week, so it can be empty while Latest is not.
  if (tab === "trending")
    return (
      <EmptyState
        title="Nothing is trending right now."
        body="Have a listen to what's new."
        action={
          <Button asChild variant="outline">
            <Link href="/feed?tab=latest">Go to Latest</Link>
          </Button>
        }
      />
    );
  return (
    <EmptyState
      title="Be the first."
      body="Upload a track and get ears on it."
      action={upload}
    />
  );
}
