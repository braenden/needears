"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  EditProfile,
  type EditableProfile,
} from "@/components/profile/edit-profile";
import { ProfileHeader } from "@/components/profile/profile-header";
import { EDIT_PROFILE_HREF } from "@/components/shell/nav";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FullProfile } from "@/lib/data/profiles";
import type { ProfileStats } from "@/types/view";

/** Opens the editor as a panel over the profile. */
const EDIT_PARAM = "edit";

// ProfileHeader with "Edit profile": a panel over the profile on wide
// screens, so the changes show behind it; its own page on phones.
export function OwnProfileHeader({
  profile,
  stats,
  isOwn,
  editable,
}: {
  profile: FullProfile;
  stats: ProfileStats;
  isOwn: boolean;
  /** Only on your own profile. */
  editable: EditableProfile | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <>
      <ProfileHeader
        profile={profile}
        stats={stats}
        isOwn={isOwn}
        onEdit={() => {
          if (window.matchMedia("(min-width: 40rem)").matches) {
            const params = new URLSearchParams(window.location.search);
            params.set(EDIT_PARAM, "profile");
            router.replace(`${pathname}?${params}`, { scroll: false });
          } else {
            router.push(EDIT_PROFILE_HREF);
          }
        }}
        workingOn={profile.workingOn}
        daw={profile.daw}
        links={profile.links}
        showStats={false}
      />
      {editable ? (
        <Suspense>
          <EditPanel editable={editable} />
        </Suspense>
      ) : null}
    </>
  );
}

function EditPanel({ editable }: { editable: EditableProfile }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = params.get(EDIT_PARAM) === "profile";

  function close(to = pathname) {
    const rest = new URLSearchParams(params);
    rest.delete(EDIT_PARAM);
    const query = rest.toString();
    router.replace(query ? `${to}?${query}` : to, { scroll: false });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent
        // Light, and no blur: the profile behind shows what is being edited.
        overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-none"
        className="top-0 right-0 left-auto h-dvh max-h-none w-[min(32rem,100%)] max-w-none translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none rounded-l-2xl duration-slow sm:max-w-none data-open:zoom-in-100 data-open:slide-in-from-right data-closed:duration-base data-closed:zoom-out-100 data-closed:slide-out-to-right"
      >
        <div className="pr-8">
          <DialogTitle className="text-xl">Edit profile</DialogTitle>
          <DialogDescription className="mt-1">
            Everything here shows on your public profile.
          </DialogDescription>
        </div>
        <EditProfile
          editable={editable}
          onSaved={(handle) => {
            if (handle !== editable.profile.handle) close(`/u/${handle}`);
            else close();
            router.refresh();
          }}
          onCancel={() => close()}
        />
      </DialogContent>
    </Dialog>
  );
}
