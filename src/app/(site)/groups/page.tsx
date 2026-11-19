import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon, PlusIcon } from "lucide-react";

import { GROUP_COPY, members } from "@/components/groups/copy";
import { Page, PageTitle } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { getMyGroups } from "@/lib/data/groups";
import { getViewer } from "@/lib/data/viewer";

export const metadata: Metadata = {
  title: "Groups",
  robots: { index: false },
};

export default async function GroupsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/groups");
  const groups = await getMyGroups();

  return (
    <Page width="narrow">
      <div className="flex items-end justify-between gap-3">
        <PageTitle>Groups</PageTitle>
        {groups.length > 0 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href="/groups/new">
              <PlusIcon aria-hidden="true" />
              New group
            </Link>
          </Button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="mt-10 grid justify-items-start gap-4">
          <p className="max-w-md text-muted-foreground">
            {GROUP_COPY.emptyList}
          </p>
          <Button asChild>
            <Link href="/groups/new">New group</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 divide-y border-y">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/g/${group.slug}`}
                className="flex items-center gap-3 py-4 focus-ring outline-none hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {group.name}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {members(group.members_count)}
                    {group.role === "owner" ? ` · ${GROUP_COPY.yours}` : ""}
                    {group.asks ? (
                      <span className="text-foreground">
                        {" · "}
                        {GROUP_COPY.askedToJoin(group.asks)}
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronRightIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
