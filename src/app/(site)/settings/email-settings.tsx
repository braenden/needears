"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { browserClient } from "@/lib/supabase/lazy";

/** Email about comments, replies and Helpful marks. Saves on change. */
export function EmailSettings({
  userId,
  initial,
}: {
  userId: string;
  initial: boolean;
}) {
  const id = useId();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function change(next: boolean) {
    setOn(next);
    setSaving(true);
    const { error } = await (
      await browserClient()
    )
      .from("profiles")
      .update({ email_notifications: next })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setOn(!next);
      toast.error("Couldn't save that. Try again.");
      return;
    }
    toast.success(next ? "Email is on." : "Email is off.");
  }

  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={on}
        disabled={saving}
        onChange={(e) => void change(e.target.checked)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5 size-4 shrink-0 accent-(--primary)"
      />
      <div className="grid gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          Email me about new comments, replies and Helpful marks
        </label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          At most one email an hour, with everything since the last one. You
          always see them under Notifications.
        </p>
      </div>
    </div>
  );
}
