"use client";

import { toast } from "sonner";

import { hostName, hostOf } from "@/components/profile/link-hosts";
import { PhotoSettings } from "@/components/profile/photo-settings";
import {
  ProfileEditor,
  type ProfileFields,
  type ProfileSaveResult,
} from "@/components/profile/profile-editor";
import { handleErrorText } from "@/lib/profile/errors";
import { browserClient } from "@/lib/supabase/lazy";
import type { Profile } from "@/types/view";

/** What the editor needs to start from. */
export type EditableProfile = {
  userId: string;
  /** avatar_url is the picture shown now (a signed URL for an uploaded one). */
  profile: Pick<Profile, "display_name" | "handle" | "avatar_url" | "bio">;
  avatarKey: string | null;
  /** The stored avatar_url (from Google), shown when there is no upload. */
  googleAvatar: string | null;
  fields: ProfileFields;
};

/**
 * The photo and the rest of the public profile, saved in one go. The same
 * on the edit page and in the panel on the profile.
 */
export function EditProfile({
  editable,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  editable: EditableProfile;
  /** After a save, with the handle it was saved under. */
  onSaved: (handle: string) => void;
  onCancel: () => void;
  /** True while there are changes that are not saved. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { userId, profile, avatarKey, googleAvatar, fields } = editable;

  async function save(next: ProfileFields): Promise<ProfileSaveResult> {
    const { error } = await (
      await browserClient()
    )
      .from("profiles")
      .update({
        handle: next.handle,
        display_name: next.displayName,
        bio: next.bio,
        working_on: next.workingOn,
        daw: next.daw,
        // The label is optional in the form but required in the database,
        // so an empty one becomes the service name ("SoundCloud").
        links: next.links.map((link) => {
          const host = hostOf(link.url);
          return {
            url: link.url,
            label: link.label.trim() || (host ? hostName(host) : "Link"),
          };
        }),
      })
      .eq("id", userId);
    if (error?.code === "22023") {
      return {
        ok: false,
        error:
          "One of the links isn't allowed. Use a full https link to one of the sites listed.",
      };
    }
    if (error) {
      const text = handleErrorText(error, next.handle);
      // Taken, reserved or malformed usernames belong next to that field.
      const aboutHandle =
        error.code === "23505" ||
        error.code === "23514" ||
        error.message === "handle_reserved";
      return {
        ok: false,
        error: text,
        field: aboutHandle ? "handle" : undefined,
      };
    }
    toast.success("Profile saved.");
    onSaved(next.handle);
    return { ok: true };
  }

  return (
    <div className="grid gap-8">
      <PhotoSettings
        userId={userId}
        profile={profile}
        avatarKey={avatarKey}
        googleAvatar={googleAvatar}
      />
      <ProfileEditor
        initial={fields}
        onSave={save}
        onCancel={onCancel}
        onDirtyChange={onDirtyChange}
      />
    </div>
  );
}
