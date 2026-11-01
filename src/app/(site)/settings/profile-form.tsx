"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BIO_MAX, DISPLAY_NAME_MAX, HANDLE_PATTERN } from "@/config/limits";
import { handleErrorText } from "@/lib/profile/errors";
import { browserClient } from "@/lib/supabase/lazy";
import type { Profile } from "@/types/view";

export function ProfileForm({
  userId,
  profile,
}: {
  userId: string;
  profile: Profile;
}) {
  const id = useId();
  const router = useRouter();
  const [handle, setHandle] = useState(profile.handle);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const clean = handle.trim().toLowerCase();
    if (!HANDLE_PATTERN.test(clean)) {
      setError("Use 3 to 20 letters, numbers or underscores.");
      return;
    }
    setError(null);
    setSaving(true);
    const { error: updateError } = await (
      await browserClient()
    )
      .from("profiles")
      .update({
        handle: clean,
        display_name: displayName.trim() || clean,
        bio: bio.trim(),
      })
      .eq("id", userId);
    setSaving(false);
    if (updateError) {
      setError(handleErrorText(updateError, clean));
      return;
    }
    toast.success("Profile saved.");
    router.refresh();
  }

  return (
    <form noValidate onSubmit={save} className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor={`${id}-handle`} className="text-sm font-medium">
          Username
        </label>
        <Input
          id={`${id}-handle`}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={20}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-handle-hint${error ? ` ${id}-error` : ""}`}
        />
        <p id={`${id}-handle-hint`} className="text-xs text-muted-foreground">
          3 to 20 characters. Letters, numbers and underscores. Changing it
          changes your profile link.
        </p>
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Display name
        </label>
        <Input
          id={`${id}-name`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX}
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor={`${id}-bio`} className="text-sm font-medium">
          Bio{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id={`${id}-bio`}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={BIO_MAX}
          aria-describedby={`${id}-bio-count`}
        />
        <p id={`${id}-bio-count`} className="text-xs text-muted-foreground">
          {BIO_MAX - bio.length} characters left.
        </p>
      </div>
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : null}
          Save profile
        </Button>
      </div>
    </form>
  );
}
