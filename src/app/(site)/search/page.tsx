import type { Metadata } from "next";
import { SearchField } from "@/components/search/search-field";
import { SearchResults } from "@/components/search/search-results";
import { searchAll } from "@/lib/data/search";

export async function generateMetadata({
  searchParams,
}: PageProps<"/search">): Promise<Metadata> {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  return {
    title: query ? `Search: ${query}` : "Search",
    // Result pages are endless and change all the time.
    robots: { index: false },
  };
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const results = await searchAll(query);

  return (
    <div>
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:pt-10">
        <h1 className="sr-only">Search</h1>
        <SearchField
          key={query}
          defaultValue={query}
          autoFocus={!query}
          formLabel="Search tracks and people"
          size="lg"
          className="max-w-2xl"
        />
        <SearchResults
          className="mt-8"
          query={query}
          tracks={results.tracks}
          profiles={results.profiles}
          status={results.failed ? "error" : "ready"}
        />
      </div>
    </div>
  );
}
