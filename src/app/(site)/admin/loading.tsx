import { Skeleton } from "@/components/ui/skeleton";
import { Page } from "@/components/shell/page";

export default function Loading() {
  return (
    <Page width="narrow" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-6 h-24 w-full rounded-xl" />
      <Skeleton className="mt-3 h-24 w-full rounded-xl" />
    </Page>
  );
}
