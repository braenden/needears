"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/monitoring/report-error";

// Error boundary for the pages. The header and footer stay usable.
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportError(error);
  }, [error]);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="sr-only">Something went wrong</h1>
      <EmptyState
        title="Something broke on our side."
        body="Try again, or come back in a minute."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
