import { ProfileHeaderSkeleton } from "@/components/profile/profile-header";
import { TrackCardSkeleton } from "@/components/track/track-card";
import { Skeleton } from "@/components/ui/skeleton";

// The profile's column: header, numbers, tabs and the first tracks.
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12"
      role="status"
      aria-label="Loading"
    >
      <ProfileHeaderSkeleton />
      <Skeleton className="mt-6 h-28 w-full rounded-xl" />
      <Skeleton className="mt-10 h-10 w-full" />
      <div className="mt-6 grid gap-3">
        <TrackCardSkeleton />
        <TrackCardSkeleton />
      </div>
    </div>
  );
}
