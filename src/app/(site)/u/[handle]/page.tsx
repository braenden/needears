import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { displayNameOf } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/empty-state";
import { TrackList } from "@/components/track/track-list";
import { Button } from "@/components/ui/button";
import { BadgeList } from "@/components/profile/badges";
import { ProfileStatsBlock } from "@/components/profile/profile-stats";
import {
  getCommentsBy,
  getEditableProfile,
  getFeedbackRecord,
  getProfileByHandle,
  getProfileStats,
} from "@/lib/data/profiles";
import { getTracksByOwner } from "@/lib/data/tracks";
import { getViewer } from "@/lib/data/viewer";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { OwnProfileHeader } from "./own-profile-header";

const loadProfile = cache(getProfileByHandle);

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
  const tab = query.tab === "comments" ? "comments" : "tracks";
  const isOwn = viewer?.userId === profile.id;
  const [stats, record, tracks, comments, editable] = await Promise.all([
    getProfileStats(profile),
    getFeedbackRecord(profile.id),
    tab === "tracks" ? getTracksByOwner(profile.id) : Promise.resolve([]),
    tab === "comments" ? getCommentsBy(profile.id) : Promise.resolve([]),
    isOwn && viewer
      ? getEditableProfile(viewer.userId, viewer.profile)
      : Promise.resolve(null),
  ]);
  const name = displayNameOf(profile);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <OwnProfileHeader
        profile={profile}
        stats={stats}
        isOwn={isOwn}
        editable={editable}
      />
      <ProfileStatsBlock stats={record.stats} className="mt-6" />
      <BadgeList badges={record.badges} showLocked={isOwn} className="mt-4" />

      <nav aria-label="Profile sections" className="mt-10 border-b">
        <ul className="-mb-px flex gap-1">
          {(
            [
              ["tracks", "Tracks", `/u/${profile.handle}`],
              [
                "comments",
                "Comments given",
                `/u/${profile.handle}?tab=comments`,
              ],
            ] as const
          ).map(([key, label, href]) => (
            <li key={key}>
              <Link
                href={href}
                aria-current={tab === key ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground focus-ring outline-none hover:text-foreground",
                  "aria-[current=page]:border-primary aria-[current=page]:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">
        <h2 className="sr-only">
          {tab === "tracks" ? "Tracks" : "Comments given"}
        </h2>
        {tab === "tracks" ? (
          tracks.length > 0 ? (
            <TrackList
              tracks={tracks}
              label={`Tracks by ${name}`}
              showOwner={false}
              className="grid gap-3"
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
          <ul className="divide-y">
            {comments.map((comment) => (
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
      </div>
    </div>
  );
}
