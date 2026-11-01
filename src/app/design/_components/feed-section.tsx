"use client";

import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { TrackCard, TrackCardSkeleton } from "@/components/track/track-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tracks } from "@/mocks/tracks";
import type { TrackSummary } from "@/types/view";

import { Example, Section } from "./section";

export function FeedSection() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const play = (t: TrackSummary) =>
    setPlayingId((id) => (id === t.id ? null : t.id));
  const lists = {
    needs: tracks.filter((t) => t.needs_ears),
    latest: [...tracks].sort((a, b) =>
      b.published_at.localeCompare(a.published_at),
    ),
    trending: [...tracks].sort(
      (a, b) => b.listener_comment_count - a.listener_comment_count,
    ),
  };

  return (
    <Section
      id="track-card"
      title="TrackCard"
      description="For the feed: play button, who made it, genre and experience, what the artist wants feedback on, a static SVG mini waveform from the peaks, and length, comments by others, reactions, plays and versions. Needs ears shows until the artist marks a comment Helpful or three people have commented."
    >
      <Example title="Feed tabs">
        <Tabs defaultValue="needs">
          <TabsList variant="line" aria-label="Feed">
            <TabsTrigger value="needs">Needs ears</TabsTrigger>
            <TabsTrigger value="latest">Latest</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
          </TabsList>
          <p className="text-sm text-muted-foreground">
            Give feedback, and your tracks get seen more.
          </p>
          {(Object.keys(lists) as (keyof typeof lists)[]).map((key) => (
            <TabsContent key={key} value={key} className="grid gap-3">
              {lists[key].map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  playing={playingId === track.id}
                  progress={playingId === track.id ? 0.35 : 0}
                  onPlay={play}
                />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </Example>
      <div className="grid gap-8 lg:grid-cols-2">
        <Example title="Loading">
          <div className="grid gap-3">
            <TrackCardSkeleton />
            <TrackCardSkeleton />
          </div>
        </Example>
        <div className="grid gap-8">
          <Example title="Feed, nothing at all">
            <EmptyState
              title="Be the first."
              body="Upload a track and get ears on it."
              action={<Button>Upload a track</Button>}
            />
          </Example>
          <Example title="Needs ears, nothing left">
            <EmptyState
              title="Every track has ears right now."
              body="Nice. Have a listen to what's new."
              action={<Button variant="outline">Go to Latest</Button>}
            />
          </Example>
          <Example title="Genre filter, no results">
            <EmptyState
              title="Nothing in Drum and bass yet."
              body="Be the first, or try another genre."
              action={<Button variant="outline">Upload a track</Button>}
            />
          </Example>
        </div>
      </div>
    </Section>
  );
}
