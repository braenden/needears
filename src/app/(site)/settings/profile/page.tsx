import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getEditableProfile } from "@/lib/data/profiles";
import { getViewer } from "@/lib/data/viewer";
import { EditProfilePage } from "./edit-profile-page";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false },
};

// Everything on the public profile in one form. On wide screens the same
// form also opens as a panel over the profile itself.
export default async function Page() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/settings/profile");
  const editable = await getEditableProfile(viewer.userId, viewer.profile);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Edit profile
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Everything here shows on your public profile.
      </p>
      <div className="mt-8 max-w-xl">
        <EditProfilePage editable={editable} />
      </div>
    </div>
  );
}
