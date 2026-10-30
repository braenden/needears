import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecksIcon, MessageSquareIcon, ThumbsUpIcon } from "lucide-react";
import { TrackList } from "@/components/track/track-list";
import { Button } from "@/components/ui/button";
import { getFeed } from "@/lib/data/tracks";
import { getViewer } from "@/lib/data/viewer";

// Landing page for visitors. Signed in people go straight to the feed.
export default async function HomePage() {
  const viewer = await getViewer();
  if (viewer) redirect("/feed");
  const { tracks } = await getFeed("trending", null, 1);
  const featured = tracks.slice(0, 3);

  return (
    <>
      <section className="mx-auto w-full max-w-3xl px-4 pt-16 pb-12 sm:pt-24">
        <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl">
          Fresh ears for your unfinished tracks.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
          Post a work in progress. Other producers leave comments at the exact
          second where something could be better. It&apos;s free.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/feed">Listen first</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login?next=/upload">Upload a track</Link>
          </Button>
        </div>
      </section>

      {featured.length > 0 ? (
        <section
          aria-labelledby="featured-heading"
          className="mx-auto w-full max-w-3xl px-4 pb-12"
        >
          <h2
            id="featured-heading"
            className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Trending now
          </h2>
          <TrackList
            tracks={featured}
            label="Featured tracks"
            className="mt-4 grid gap-3"
          />
          <Link
            href="/feed"
            className="mt-4 inline-block text-sm text-primary-text underline-offset-4 hover:underline"
          >
            See the whole feed
          </Link>
        </section>
      ) : null}

      <section
        aria-labelledby="how-heading"
        className="mx-auto w-full max-w-3xl px-4 pb-8"
      >
        <h2
          id="how-heading"
          className="font-display text-2xl font-bold tracking-tight"
        >
          How it works
        </h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: MessageSquareIcon,
              title: "Comments on the waveform",
              body: "“Vocal gets buried at 1:42.” Feedback pinned to the moment it is about.",
            },
            {
              icon: ListChecksIcon,
              title: "Ask for what you need",
              body: "Mix, arrangement, vocals or just the vibe. Say what you want feedback on.",
            },
            {
              icon: ThumbsUpIcon,
              title: "Helpful feedback counts",
              body: "Mark the comments that helped you. That's what builds reputation.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-xl border bg-card p-5">
              <Icon className="size-5 text-primary-text" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
