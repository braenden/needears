"use client";

import { useRouter } from "next/navigation";
import {
  EditProfile,
  type EditableProfile,
} from "@/components/profile/edit-profile";

/** The editor as a page: saving or cancelling goes back to the profile. */
export function EditProfilePage({ editable }: { editable: EditableProfile }) {
  const router = useRouter();
  return (
    <EditProfile
      editable={editable}
      onSaved={(handle) => {
        router.push(`/u/${handle}`);
        router.refresh();
      }}
      onCancel={() => router.push(`/u/${editable.profile.handle}`)}
    />
  );
}
