"use client";

import { useState, useSyncExternalStore } from "react";

import { SearchField } from "@/components/search/search-field";
import { SearchResults } from "@/components/search/search-results";
import { SiteHeader } from "@/components/shell/app-shell";
import { jonas } from "@/mocks/profiles";
import { searchMock } from "@/mocks/search";

import { Example, PhoneFrame, Section } from "./section";

const noop = () => () => {};

/** ?q= from the address bar, so the search box in the top bar lands here. */
function useQueryParam() {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get("q") ?? "",
    () => "",
  );
}

function SearchPageDemo() {
  const fromUrl = useQueryParam();
  const [typed, setTyped] = useState<string | null>(null);
  const query = typed ?? (fromUrl || "mi");
  const { tracks, profiles } = searchMock(query);
  return (
    <div className="grid gap-5 rounded-xl border p-4 sm:p-6">
      <div className="grid gap-1.5">
        <label htmlFor="design-search-q" className="text-sm font-medium">
          Search
        </label>
        <input
          id="design-search-q"
          type="search"
          value={query}
          onChange={(e) => setTyped(e.target.value)}
          className="h-10 w-full max-w-sm rounded-md border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35 sm:text-sm"
          autoComplete="off"
        />
      </div>
      <SearchResults query={query} tracks={tracks} profiles={profiles} />
    </div>
  );
}

export function SearchSection() {
  return (
    <Section
      id="search"
      title="Search"
      description="A search box in the top bar (press / to jump to it) and a results page with tracks and people in two groups. On phones the top bar shows a search button that opens the results page."
    >
      <Example
        title="Results page"
        note="Try mi, night, house or something that is not there. The search box in this page's top bar lands here too."
      >
        <SearchPageDemo />
      </Example>
      <Example title="Top bar with search">
        <div className="overflow-hidden rounded-xl border">
          <SiteHeader
            user={jonas}
            navLabel="Demo, with search"
            showSearch
            searchShortcut={false}
            searchAction="/design#search"
          />
        </div>
      </Example>
      <Example
        title="Top bar on a phone"
        note="A search button instead of the box."
      >
        <PhoneFrame>
          <SiteHeader
            user={jonas}
            navLabel="Demo, phone with search"
            showSearch
            searchShortcut={false}
            searchAction="/design#search"
          />
        </PhoneFrame>
      </Example>
      <div className="grid gap-8 lg:grid-cols-2">
        <Example title="Too short">
          <SearchResults query="m" tracks={[]} profiles={[]} />
        </Example>
        <Example title="Searching">
          <SearchResults
            query="night"
            tracks={[]}
            profiles={[]}
            status="loading"
          />
        </Example>
        <Example title="Nothing found">
          <SearchResults query="night bsu" tracks={[]} profiles={[]} />
        </Example>
        <Example title="Something broke">
          <SearchResults
            query="night"
            tracks={[]}
            profiles={[]}
            status="error"
          />
        </Example>
      </div>
      <Example
        title="Search box alone"
        note="A plain GET form, so it works before JavaScript loads."
      >
        <SearchField
          shortcut={false}
          action="/design#search"
          formLabel="Search, example"
          className="max-w-xs"
        />
      </Example>
    </Section>
  );
}
