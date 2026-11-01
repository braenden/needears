"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DiscardChangesDialog } from "@/components/profile/discard-changes-dialog";
import {
  EditProfile,
  type EditableProfile,
} from "@/components/profile/edit-profile";

/**
 * The editor as a page: saving or cancelling goes back to the profile.
 * With changes that are not saved, leaving by Cancel or a link asks first,
 * and closing or reloading the tab gets the browser's own warning.
 */
export function EditProfilePage({ editable }: { editable: EditableProfile }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  // Where to go once the person says Discard.
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  const profileHref = `/u/${editable.profile.handle}`;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    // Links anywhere on the page (the header, the menu): ask before going.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank")
        return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setLeavingTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return (
    <>
      <EditProfile
        editable={editable}
        onDirtyChange={setDirty}
        onSaved={(handle) => {
          setDirty(false);
          router.push(`/u/${handle}`);
          router.refresh();
        }}
        onCancel={() =>
          dirty ? setLeavingTo(profileHref) : router.push(profileHref)
        }
      />
      <DiscardChangesDialog
        open={leavingTo !== null}
        onKeep={() => setLeavingTo(null)}
        onDiscard={() => {
          const to = leavingTo;
          setLeavingTo(null);
          setDirty(false);
          if (to) router.push(to);
        }}
      />
    </>
  );
}
