import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12"
      role="status"
      aria-label="Loading"
    >
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-6 h-24 w-full rounded-xl" />
      <Skeleton className="mt-3 h-24 w-full rounded-xl" />
    </div>
  );
}
