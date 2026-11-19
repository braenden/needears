import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Page, PageTitle } from "@/components/shell/page";
import { GROUP_COPY } from "@/components/groups/copy";
import { Button } from "@/components/ui/button";
import { GROUPS_MAX } from "@/config/limits";
import { getMyGroups } from "@/lib/data/groups";
import { getViewer } from "@/lib/data/viewer";
import { NewGroupForm } from "./new-group-form";

export const metadata: Metadata = {
  title: "New group",
  robots: { index: false },
};

export default async function NewGroupPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/groups/new");
  if (!viewer.onboarded) redirect("/welcome?next=/groups/new");
  const groups = await getMyGroups();
  const owned = groups.filter((g) => g.role === "owner").length;

  return (
    <Page width="narrow">
      <div className="max-w-md">
        <PageTitle>New group</PageTitle>
        {owned >= GROUPS_MAX ? (
          <div className="mt-8 grid justify-items-start gap-4">
            <p className="text-muted-foreground">{GROUP_COPY.tooMany}</p>
            <Button variant="outline" asChild>
              <Link href="/groups">Your groups</Link>
            </Button>
          </div>
        ) : (
          <NewGroupForm />
        )}
      </div>
    </Page>
  );
}
