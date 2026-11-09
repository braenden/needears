import { TrackRowSkeleton } from "@/components/track/track-row";
import { Skeleton } from "@/components/ui/skeleton";

// The feed's column, tabs and rows, so nothing moves when the tracks come in.
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:pt-8"
      role="status"
      aria-label="Loading"
    >
      <div className="flex h-11 items-center justify-between border-b">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="divide-y">
        <TrackRowSkeleton />
        <TrackRowSkeleton />
        <TrackRowSkeleton />
        <TrackRowSkeleton />
      </div>
    </div>
  );
}
