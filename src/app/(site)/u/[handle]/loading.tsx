import { ProfileHeaderSkeleton } from "@/components/profile/profile-header";
import { TrackRowSkeleton } from "@/components/track/track-row";
import { Skeleton } from "@/components/ui/skeleton";
import { Page } from "@/components/shell/page";

// The profile's column: header, tabs and the first tracks.
export default function Loading() {
  return (
    <Page role="status" aria-label="Loading">
      <ProfileHeaderSkeleton />
      <Skeleton className="mt-8 h-11 w-full" />
      <div className="divide-y">
        <TrackRowSkeleton />
        <TrackRowSkeleton />
      </div>
    </Page>
  );
}
