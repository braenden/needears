import { ProfileHeaderSkeleton } from "@/components/profile/profile-header";
import { TrackRowSkeleton } from "@/components/track/track-row";
import { Skeleton } from "@/components/ui/skeleton";

// The profile's column: header, tabs and the first tracks.
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:pt-10"
      role="status"
      aria-label="Loading"
    >
      <ProfileHeaderSkeleton />
      <Skeleton className="mt-8 h-11 w-full" />
      <div className="divide-y">
        <TrackRowSkeleton />
        <TrackRowSkeleton />
      </div>
    </div>
  );
}
