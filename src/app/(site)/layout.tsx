import { AppShell } from "@/components/shell/app-shell";
import { getViewer } from "@/lib/data/viewer";

// Frame for every page except /design: header with the signed in person,
// main landmark and footer.
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  return (
    <AppShell
      user={viewer?.profile ?? null}
      isAdmin={viewer?.isAdmin ?? false}
      unread={viewer?.unread ?? 0}
    >
      {children}
    </AppShell>
  );
}
