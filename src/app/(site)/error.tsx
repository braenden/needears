"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/empty-state";
import { Page } from "@/components/shell/page";
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
    <Page width="task">
      <h1 className="sr-only">Something went wrong</h1>
      <EmptyState
        title="Something broke on our side."
        body="Try again, or come back in a minute."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Page>
  );
}
