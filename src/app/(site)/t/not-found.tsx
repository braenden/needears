import { headers } from "next/headers";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { MembersOnly } from "@/components/groups/members-only";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { isGroupTrack } from "@/lib/data/groups";
import { getViewer } from "@/lib/data/viewer";

// A track that is not there. A group's track someone outside the group
// opens says it is for members, and nothing about it: no title, no artist,
// no group.
export default async function TrackNotFound() {
  const path = (await headers()).get("x-pathname") ?? "";
  const slug = decoded(/^\/t\/([^/]+)$/.exec(path)?.[1]);
  const [members, viewer] = await Promise.all([
    slug ? isGroupTrack(slug).catch(() => false) : Promise.resolve(false),
    getViewer(),
  ]);
  if (members) return <MembersOnly signedIn={viewer !== null} />;
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

/** The slug from the address, or null when it does not decode. */
function decoded(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
