import { TrackCardSkeleton } from "@/components/track/track-card";
import { Skeleton } from "@/components/ui/skeleton";

// The feed's column and spacing, so nothing moves when the tracks come in.
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10"
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-60" />
      </div>
      <Skeleton className="mt-6 h-10 w-72" />
      <Skeleton className="mt-3 h-10 w-full" />
      <div className="mt-6 grid gap-3">
        <TrackCardSkeleton />
        <TrackCardSkeleton />
        <TrackCardSkeleton />
      </div>
    </div>
  );
}
