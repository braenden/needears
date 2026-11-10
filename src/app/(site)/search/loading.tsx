import { Page } from "@/components/shell/page";
import { Skeleton } from "@/components/ui/skeleton";

// The search page's column: the field, and rows where the results will be.
export default function Loading() {
  return (
    <Page role="status" aria-label="Searching">
      <Skeleton className="h-12 w-full max-w-2xl rounded-lg" />
      <div className="mt-8 grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </Page>
  );
}
