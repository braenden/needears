import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { reputationLevelFor } from "@/config/reputation";
import { getTrackPage } from "@/lib/data/tracks";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/time";
import type { ReactionKind } from "@/types/view";
import { TrackView } from "./track-view";

const loadTrack = cache(getTrackPage);

export async function generateMetadata({
  params,
}: PageProps<"/t/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadTrack(slug);
  if (!data) return { title: "Track not found" };
  const { track } = data;
  const owner = track.owner.display_name || track.owner.handle;
  const description =
    track.description.slice(0, 160) ||
    `${track.genre.name} track by ${owner}, ${formatTime(track.duration_ms)}. Listen and leave timestamped feedback.`;
  const image = `/api/og/${track.slug}`;
  return {
    title: `${track.title} by ${owner}`,
    description,
    alternates: { canonical: `/t/${track.slug}` },
    // Hidden tracks are only visible to the owner and admins.
    robots: track.status === "live" ? undefined : { index: false },
    openGraph: {
      type: "music.song",
      title: track.title,
      description,
      url: `/t/${track.slug}`,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

// Seconds from ?t=, for links back to the same moment (after sign in).
function startSeconds(value: unknown, durationMs: number): number {
  const seconds = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, Math.floor(durationMs / 1000));
}

export default async function TrackPage({
  params,
  searchParams,
}: PageProps<"/t/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [data, viewer] = await Promise.all([loadTrack(slug), getViewer()]);
  if (!data) notFound();
  const { track, audioUrl, comments } = data;

  let mine: ReactionKind[] = [];
  if (viewer) {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from("reactions")
      .select("kind")
      .eq("track_id", track.id)
      .eq("user_id", viewer.userId);
    mine = (rows ?? []).map((r) => r.kind);
  }

  const filter =
    query.filter === "helpful" || query.filter === "trusted"
      ? query.filter
      : "all";

  return (
    <TrackView
      track={track}
      audioUrl={audioUrl}
      initialComments={comments}
      initialReactions={mine}
      viewer={
        viewer
          ? {
              userId: viewer.userId,
              profile: viewer.profile,
              commentsPerHour: reputationLevelFor(viewer.profile.reputation)
                .limits.commentsPerHour,
            }
          : null
      }
      startSeconds={startSeconds(query.t, track.duration_ms)}
      initialFilter={filter}
    />
  );
}
