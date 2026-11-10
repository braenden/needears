import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { getFeed, getTrackPage } from "@/lib/data/tracks";
import { getViewer } from "@/lib/data/viewer";
import { HomeTracks, type HomeTrack } from "./home-tracks";

/** Rows under the intro. */
const TRENDING = 3;

/**
 * The track to play beside the intro: the top trending one that has
 * comments, with the timed comments on the version that plays.
 */
async function featuredTrack(slug: string): Promise<HomeTrack | null> {
  // The page is fine without it.
  const data = await getTrackPage(slug).catch(() => null);
  if (!data || data.track.status !== "live") return null;
  const latest = data.versions.at(-1);
  const comments = data.comments
    .filter(
      (c) =>
        c.status === "live" &&
        !c.parent_id &&
        !c.resolved_at &&
        c.time_ms !== null &&
        (!c.version_id || !latest || c.version_id === latest.id),
    )
    .sort((a, b) => (a.time_ms ?? 0) - (b.time_ms ?? 0));
  return { track: data.track, audioUrl: data.audioUrl, comments };
}

// Landing page for visitors. Signed in people go straight to the feed.
export default async function HomePage() {
  const viewer = await getViewer();
  if (viewer) redirect("/feed");
  const { tracks } = await getFeed("trending", null, 1);
  const pick = tracks.find((t) => t.comment_count > 0) ?? tracks[0];
  const featured = pick ? await featuredTrack(pick.slug) : null;
  const trending = tracks
    .filter((t) => t.id !== featured?.track.id)
    .slice(0, TRENDING);

  return (
    <Page>
      <HomeTracks featured={featured} trending={trending}>
        <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl lg:text-5xl xl:text-6xl">
          Fresh ears for your unfinished tracks.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
          Post a work in progress and get free feedback on the mix, the
          arrangement and the vibe from other producers.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/feed">Listen first</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login?next=/upload">Upload a track</Link>
          </Button>
        </div>
      </HomeTracks>
    </Page>
  );
}
