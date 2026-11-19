import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  countOwnTracks,
  getAsks,
  getGroupBySlug,
  getGroupStatus,
  getMembers,
  getRole,
} from "@/lib/data/groups";
import { getGroupTracks } from "@/lib/data/tracks";
import { getViewer } from "@/lib/data/viewer";
import { GroupCard } from "./group-card";
import { GroupView } from "./group-view";

const loadGroup = cache(getGroupBySlug);

export async function generateMetadata({
  params,
}: PageProps<"/g/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const group = await loadGroup(slug);
  if (!group) return { title: "Group not found", robots: { index: false } };
  // The name is on the card anyone can see. What is in the group is not
  // for search engines or link previews.
  return { title: group.name, robots: { index: false, follow: false } };
}

export default async function GroupPage({ params }: PageProps<"/g/[slug]">) {
  const { slug } = await params;
  const [group, viewer] = await Promise.all([loadGroup(slug), getViewer()]);
  if (!group) notFound();

  const role = await getRole(group.id, viewer?.userId ?? null);
  // Outside the group: its card, and the way in.
  if (!role || !viewer) {
    const status = viewer ? await getGroupStatus(group.id) : null;
    return (
      <GroupCard
        group={group}
        status={status}
        signedIn={viewer !== null}
        onboarded={viewer?.onboarded ?? false}
      />
    );
  }

  const isOwner = role === "owner";
  const [tracks, members, asks, ownTracks] = await Promise.all([
    getGroupTracks(group.id),
    getMembers(group.id),
    isOwner ? getAsks(group.id) : Promise.resolve([]),
    isOwner ? Promise.resolve(0) : countOwnTracks(group.id, viewer.userId),
  ]);

  return (
    <GroupView
      group={group}
      role={role}
      tracks={tracks}
      members={members}
      asks={asks}
      ownTracks={ownTracks}
    />
  );
}
