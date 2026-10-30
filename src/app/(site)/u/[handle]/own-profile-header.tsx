"use client";

import { useRouter } from "next/navigation";
import { ProfileHeader } from "@/components/profile/profile-header";
import type { Profile, ProfileStats } from "@/types/view";

// ProfileHeader with "Edit profile" going to the settings page.
export function OwnProfileHeader({
  profile,
  stats,
  isOwn,
}: {
  profile: Profile;
  stats: ProfileStats;
  isOwn: boolean;
}) {
  const router = useRouter();
  return (
    <ProfileHeader
      profile={profile}
      stats={stats}
      isOwn={isOwn}
      onEdit={() => router.push("/settings")}
    />
  );
}
