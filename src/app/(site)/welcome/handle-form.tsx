"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DISPLAY_NAME_MAX, HANDLE_PATTERN } from "@/config/limits";
import { handleErrorText } from "@/lib/profile/errors";
import { browserClient } from "@/lib/supabase/lazy";
import { focusFirstInvalid } from "@/lib/forms/focus-invalid";

export function HandleForm({
  userId,
  initialHandle,
  initialDisplayName,
  next,
}: {
  userId: string;
  initialHandle: string;
  initialDisplayName: string;
  next: string;
}) {
  const id = useId();
  const router = useRouter();
  const [handle, setHandle] = useState(initialHandle);
  const [displayName, setDisplayName] = useState(
    initialDisplayName === initialHandle ? "" : initialDisplayName,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const clean = handle.trim().toLowerCase();
    if (!HANDLE_PATTERN.test(clean)) {
      setError("Use 3 to 20 letters, numbers or underscores.");
      focusFirstInvalid(form);
      return;
    }
    setError(null);
    setSaving(true);
    const supabase = await browserClient();
    const name = displayName.trim() || clean;
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ handle: clean, display_name: name })
      .eq("id", userId);
    if (updateError) {
      setSaving(false);
      setError(handleErrorText(updateError, clean));
      focusFirstInvalid(form);
      return;
    }
    // Remembered on the account, so the next sign in skips this page.
    await supabase.auth.updateUser({ data: { onboarded: true } });
    toast(
      `Welcome, ${name}. When a comment on your track helps you, mark it Helpful.`,
      { duration: 15_000, closeButton: true },
    );
    router.replace(next);
    router.refresh();
  }

  return (
    <form noValidate onSubmit={save} className="mt-8 grid gap-5">
      <div className="grid gap-2">
        <label htmlFor={`${id}-handle`} className="text-sm font-medium">
          Username
        </label>
        <Input
          id={`${id}-handle`}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          3 to 20 characters. Letters, numbers and underscores. Your link:
          needears.com/u/{handle.trim().toLowerCase() || "handle"}
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
          Display name{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id={`${id}-name`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="nickname"
          aria-describedby={`${id}-name-hint`}
        />
        <p id={`${id}-name-hint`} className="text-xs text-muted-foreground">
          What should people call you?
        </p>
      </div>
      <Button type="submit" size="lg" disabled={saving}>
        {saving ? <Loader2Icon className="animate-spin" /> : null}
        Continue
      </Button>
    </form>
  );
}
