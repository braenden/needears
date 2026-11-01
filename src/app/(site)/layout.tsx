import { RememberLogin } from "@/components/common/remember-login";
import { SharedAudioProvider } from "@/components/player/shared-audio";
import { AppShell } from "@/components/shell/app-shell";
import { ServerNow } from "@/hooks/use-now";
import { getViewer } from "@/lib/data/viewer";
import { currentMinute } from "@/lib/time";

// Frame for every page except /design: header with the signed in person,
// main landmark and footer.
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  // Rendered per request (getViewer waits for one), so the clock is fine to
  // read here.
  const now = currentMinute();
  return (
    <AppShell
      user={viewer?.profile ?? null}
      isAdmin={viewer?.isAdmin ?? false}
      unread={viewer?.unread ?? 0}
      showSearch
    >
      <ServerNow value={now}>
        <SharedAudioProvider>{children}</SharedAudioProvider>
      </ServerNow>
      <RememberLogin />
    </AppShell>
  );
}
