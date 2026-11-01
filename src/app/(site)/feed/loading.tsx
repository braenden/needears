import { TrackCardSkeleton } from "@/components/track/track-card";
import { Skeleton } from "@/components/ui/skeleton";

// The feed's own grid and spacing, so the column does not move when the
// tracks come in.
export default function Loading() {
  return (
    <div
      className="@container w-full py-8 sm:py-10"
      role="status"
      aria-label="Loading"
    >
      <div className="mx-auto grid max-w-6xl gap-6 px-4 @6xl:grid-cols-[minmax(0,1fr)_40rem_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-160 min-w-0 @6xl:col-start-2">
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
      </div>
    </div>
  );
}
