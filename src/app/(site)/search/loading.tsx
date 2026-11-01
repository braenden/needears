import { Skeleton } from "@/components/ui/skeleton";

// The search page's column, with rows where the results will be.
export default function Loading() {
  return (
    <div className="@container">
      <div
        className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10"
        role="status"
        aria-label="Searching"
      >
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Search
        </h1>
        <Skeleton className="mt-6 h-9 w-full @min-[40rem]:hidden" />
        <div className="mt-8 grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
