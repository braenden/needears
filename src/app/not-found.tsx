import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/data/viewer";

// Not found for any URL. The header is the same as on every other page, so
// a dead link does not look like being signed out.
export default async function NotFound() {
  const viewer = await getViewer();
  return (
    <AppShell
      user={viewer?.profile ?? null}
      isAdmin={viewer?.isAdmin ?? false}
      unread={viewer?.unread ?? 0}
      showSearch
    >
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
