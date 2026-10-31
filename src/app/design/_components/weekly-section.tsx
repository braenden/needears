"use client";

import { WeeklyEars } from "@/components/feed/weekly-ears";
import { TrackCard } from "@/components/track/track-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tracks } from "@/mocks/tracks";
import { weeklyLeaders, weekResetsAt } from "@/mocks/weekly";

import { Example, PhoneFrame, Section } from "./section";

/** The feed with the weekly list where it lives: side column wide, row under the tabs narrow. */
function FeedLayout() {
  return (
    <div className="@container">
      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_15rem]">
        <Tabs defaultValue="needs" className="min-w-0">
          <TabsList variant="line" aria-label="Feed">
            <TabsTrigger value="needs">Needs ears</TabsTrigger>
            <TabsTrigger value="latest">Latest</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
          </TabsList>
          <WeeklyEars
            variant="row"
            leaders={weeklyLeaders}
            resetsAt={weekResetsAt}
            className="@3xl:hidden"
          />
          {["needs", "latest", "trending"].map((tab) => (
            <TabsContent key={tab} value={tab} className="grid gap-3">
              {tracks.slice(0, 2).map((track) => (
                <TrackCard key={track.id} track={track} />
              ))}
            </TabsContent>
          ))}
        </Tabs>
        <aside aria-label="This week" className="hidden @3xl:block">
          <WeeklyEars
            leaders={weeklyLeaders}
            resetsAt={weekResetsAt}
            className="sticky top-20"
          />
        </aside>
      </div>
    </div>
  );
}

export function WeeklySection() {
  return (
    <Section
      id="weekly"
      title="Weekly list"
      description="The ten people whose comments were marked Helpful most this week. It starts over every Monday, so anyone can get on it. A narrow list beside the feed on desktop, a row under the tabs on phones."
    >
      <Example
        title="In the feed"
        note="Resize the window: the list moves from the side column to a row under the tabs."
      >
        <FeedLayout />
      </Example>
      <Example title="On a phone">
        <PhoneFrame>
          <div className="p-4">
            <FeedLayout />
          </div>
        </PhoneFrame>
      </Example>
      <div className="grid gap-8 lg:grid-cols-3">
        <Example title="Loading">
          <WeeklyEars leaders={[]} resetsAt={weekResetsAt} loading />
        </Example>
        <Example title="Nobody yet this week">
          <WeeklyEars leaders={[]} resetsAt={weekResetsAt} />
        </Example>
        <Example title="Row, nobody yet">
          <WeeklyEars variant="row" leaders={[]} resetsAt={weekResetsAt} />
        </Example>
      </div>
    </Section>
  );
}
