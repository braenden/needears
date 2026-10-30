import type { Metadata } from "next";
import Link from "next/link";
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
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">Feed</h1>
        <GenreFilter genres={genres} value={genre?.slug ?? ""} tab={tab} />
      </div>

      <nav aria-label="Feed tabs" className="mt-6 border-b">
        <ul className="-mb-px flex gap-1">
          {FEED_TABS.map((t) => (
            <li key={t}>
              <Link
                href={feedHref(t, genre?.slug ?? null)}
                aria-current={t === tab ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  "aria-[current=page]:border-primary aria-[current=page]:text-foreground",
                )}
              >
                {TAB_LABELS[t]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "needs-ears" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Tracks that haven&apos;t had much feedback yet. Give feedback, and
          your own tracks get seen more.
        </p>
      ) : null}

      <div className="mt-6">
        <h2 className="sr-only">
          {TAB_LABELS[tab]}
          {genre ? `, ${genre.name}` : ""}
        </h2>
        {page > 1 ? (
          <Button asChild variant="ghost" size="sm" className="mb-4">
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
    </div>
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
  return (
    <EmptyState
      title="Be the first."
      body="Upload a track and get ears on it."
      action={upload}
    />
  );
}
