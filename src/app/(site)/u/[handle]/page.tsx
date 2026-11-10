import type { Metadata } from "next";
import Link from "next/link";
import { SlidingUnderline } from "@/components/common/sliding-underline";
import { notFound } from "next/navigation";
import { displayNameOf } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/empty-state";
import { TrackList } from "@/components/track/track-list";
import { Button } from "@/components/ui/button";
import {
  getCommentsBy,
  getEditableProfile,
  getFeedbackRecord,
  getProfileStats,
} from "@/lib/data/profiles";
import { getTracksByOwner } from "@/lib/data/tracks";
import { getViewer } from "@/lib/data/viewer";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { loadProfile } from "./load";
import { ProfileAbout } from "./about";
import { OwnProfileHeader } from "./own-profile-header";
import { Page } from "@/components/shell/page";

const PAGE = 30;

export async function generateMetadata({
  params,
}: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  if (!profile) return { title: "Profile not found" };
  const name = displayNameOf(profile);
  const description =
    profile.bio || `${name} (@${profile.handle}) on Need Ears.`;
  const image = `/api/og/u/${profile.handle}`;
  return {
    title: `${name} (@${profile.handle})`,
    description,
    alternates: { canonical: `/u/${profile.handle}` },
    openGraph: {
      type: "profile",
      title: name,
      description,
      url: `/u/${profile.handle}`,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default async function ProfilePage({
  params,
  searchParams,
}: PageProps<"/u/[handle]">) {
  const [{ handle }, query, viewer] = await Promise.all([
    params,
    searchParams,
    getViewer(),
  ]);
  const profile = await loadProfile(handle);
  if (!profile) notFound();
  const tab =
    query.tab === "comments" || query.tab === "about" ? query.tab : "tracks";
  // "Load more" asks for the next page: 30 more each time, up to 300.
  const count = Math.min(
    300,
    Math.max(PAGE, Math.ceil(Number(query.show) / PAGE || 1) * PAGE),
  );
  const isOwn = viewer?.userId === profile.id;
  const [stats, record, tracks, comments, editable] = await Promise.all([
    getProfileStats(profile),
    tab === "about" ? getFeedbackRecord(profile.id) : Promise.resolve(null),
    tab === "tracks"
      ? getTracksByOwner(profile.id, count + 1)
      : Promise.resolve([]),
    tab === "comments"
      ? getCommentsBy(profile.id, count + 1)
      : Promise.resolve([]),
    isOwn && viewer
      ? getEditableProfile(viewer.userId, viewer.profile)
      : Promise.resolve(null),
  ]);
  const name = displayNameOf(profile);
  const listed = tab === "tracks" ? tracks : tab === "comments" ? comments : [];
  const hasMore = listed.length > count && count < 300;
  const moreHref = `/u/${profile.handle}?${new URLSearchParams({
    ...(tab === "comments" ? { tab } : {}),
    show: String(count + PAGE),
  })}`;

  return (
    <Page>
      <OwnProfileHeader profile={profile} isOwn={isOwn} editable={editable} />

      <nav aria-label="Profile sections" className="relative mt-8 border-b">
        <ul className="-mb-px flex gap-5">
          {(
            [
              ["tracks", "Tracks", `/u/${profile.handle}`],
              ["comments", "Comments", `/u/${profile.handle}?tab=comments`],
              ["about", "About", `/u/${profile.handle}?tab=about`],
            ] as const
          ).map(([key, label, href]) => (
            <li key={key}>
              <Link
                href={href}
                aria-current={tab === key ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 border-transparent text-[15px] text-muted-foreground focus-ring outline-none hover:text-foreground",
                  "aria-[current=page]:border-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground in-data-[underline=ready]:aria-[current=page]:border-transparent",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <SlidingUnderline
          selector='[aria-current="page"]'
          className="-bottom-px bg-foreground"
        />
      </nav>

      <div>
        <h2 className="sr-only">
          {tab === "tracks"
            ? "Tracks"
            : tab === "comments"
              ? "Comments"
              : "About"}
        </h2>
        {tab === "about" && record ? (
          <ProfileAbout
            stats={record.stats}
            badges={record.badges}
            helpfulReceived={profile.reputation}
            isOwn={isOwn}
            workingOn={profile.workingOn}
            daw={profile.daw}
            createdAt={profile.created_at}
          />
        ) : tab === "tracks" ? (
          tracks.length > 0 ? (
            <TrackList
              tracks={tracks.slice(0, count)}
              label={`Tracks by ${name}`}
              showOwner={false}
            />
          ) : isOwn ? (
            <EmptyState
              title="You haven't uploaded anything yet."
              body="Your first track takes about two minutes."
              action={
                <Button asChild>
                  <Link href="/upload">Upload a track</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No tracks yet."
              body={
                stats.commentsGiven > 0
                  ? `Listening counts too: ${stats.commentsGiven} ${stats.commentsGiven === 1 ? "comment" : "comments"} given.`
                  : `${name} just got here.`
              }
            />
          )
        ) : comments.length > 0 ? (
          <ul className="max-w-3xl divide-y">
            {comments.slice(0, count).map((comment) => (
              <li key={comment.id} className="py-4">
                <p className="text-sm text-muted-foreground">
                  On{" "}
                  <Link
                    href={`/t/${comment.track!.slug}${comment.time_ms !== null ? `?t=${Math.floor(comment.time_ms / 1000)}` : ""}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {comment.track!.title}
                  </Link>
                  {comment.time_ms !== null
                    ? ` at ${formatTime(comment.time_ms)}`
                    : ""}
                  {comment.is_helpful ? " · marked Helpful" : ""}
                </p>
                <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-line">
                  {comment.body}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No comments yet." />
        )}
        {hasMore ? (
          <div className="mt-6 flex justify-center">
            <Button asChild variant="outline">
              <Link href={moreHref} scroll={false}>
                Load more
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
