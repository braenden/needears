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
    // Measured like the header, so this box shows exactly when the header's
    // box does not.
    <div className="@container">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Search
        </h1>
        <SearchField
          key={query}
          defaultValue={query}
          shortcut={false}
          autoFocus={!query}
          formLabel="Search tracks and people"
          className="mt-6 @min-[40rem]:hidden"
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
