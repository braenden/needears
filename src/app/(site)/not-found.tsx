import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";

// notFound() inside the site: the header stays as it is.
export default function SiteNotFound() {
  return (
    <Page width="task">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        title="We can't find that page."
        body="It may have been moved or removed."
        action={
          <Button asChild>
            <Link href="/feed">Back to the feed</Link>
          </Button>
        }
      />
    </Page>
  );
}
