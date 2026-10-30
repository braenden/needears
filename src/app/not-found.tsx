import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

// Not found for any URL. It has no session data, so the header shows the
// signed out state; the link back works either way.
export default function NotFound() {
  return (
    <AppShell user={null}>
      <div className="mx-auto w-full max-w-xl px-4 py-16">
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
      </div>
    </AppShell>
  );
}
