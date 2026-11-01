"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AvatarUpload,
  type AvatarSaveResult,
} from "@/components/profile/avatar-upload";
import { browserClient } from "@/lib/supabase/lazy";
import type { Profile } from "@/types/view";

const UPLOAD_FAILED =
  "Couldn't upload your photo. Try again, or come back in a minute.";

async function setAvatarKey(key: string | null): Promise<string | null> {
  const response = await fetch("/api/profile/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? UPLOAD_FAILED;
}

/** Upload, change or remove the profile photo. */
export function PhotoSettings({
  userId,
  profile,
  avatarKey,
  googleAvatar,
}: {
  userId: string;
  /** avatar_url is the picture shown now (a signed URL for an uploaded one). */
  profile: Pick<Profile, "display_name" | "handle" | "avatar_url">;
  avatarKey: string | null;
  /** The stored avatar_url (from Google), shown when there is no upload. */
  googleAvatar: string | null;
}) {
  const router = useRouter();
  const [key, setKey] = useState(avatarKey);
  const [shown, setShown] = useState(profile.avatar_url);

  async function savePhoto(photo: Blob): Promise<AvatarSaveResult> {
    const supabase = await browserClient();
    const ext = photo.type === "image/webp" ? "webp" : "jpg";
    const next = `${userId}/${crypto.randomUUID()}.${ext}`;
    const uploaded = await supabase.storage
      .from("avatars")
      .upload(next, photo, { contentType: photo.type, upsert: false });
    if (uploaded.error) return { ok: false, error: UPLOAD_FAILED };

    const error = await setAvatarKey(next);
    if (error) {
      await supabase.storage.from("avatars").remove([next]);
      return { ok: false, error };
    }
    // The old file is no longer anyone's avatar, so it can go. People keep
    // at most a few files, and this keeps room for the next change.
    if (key) await supabase.storage.from("avatars").remove([key]);
    setKey(next);
    setShown(URL.createObjectURL(photo));
    toast.success("Photo saved.");
    router.refresh();
    return { ok: true };
  }

  async function removePhoto() {
    const supabase = await browserClient();
    const error = key ? await setAvatarKey(null) : null;
    // Removing goes all the way to initials, so a Google picture goes too.
    const cleared = googleAvatar
      ? await supabase
          .from("profiles")
          .update({ avatar_url: null })
          .eq("id", userId)
      : { error: null };
    if (error || cleared.error) {
      toast.error("Couldn't remove your photo. Try again.");
      return;
    }
    if (key) await supabase.storage.from("avatars").remove([key]);
    setKey(null);
    setShown(null);
    toast.success("Photo removed.");
    router.refresh();
  }

  return (
    <AvatarUpload
      profile={{ ...profile, avatar_url: shown }}
      hasUploadedPhoto={!!shown}
      onSave={savePhoto}
      onRemove={() => void removePhoto()}
    />
  );
}
