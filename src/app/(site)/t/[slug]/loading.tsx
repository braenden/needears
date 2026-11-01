import { Skeleton } from "@/components/ui/skeleton";

// The track page's column: title, who and when, the player, reactions and
// the start of the comments.
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10"
      role="status"
      aria-label="Loading"
    >
      <Skeleton className="h-8 w-2/3 sm:h-10" />
      <Skeleton className="mt-3 h-6 w-56" />
      <Skeleton className="mt-6 h-[184px] w-full rounded-xl" />
      <Skeleton className="mt-4 h-9 w-80 max-w-full rounded-full" />
      <Skeleton className="mt-10 h-7 w-36" />
      <Skeleton className="mt-4 h-40 w-full rounded-xl" />
    </div>
  );
}
