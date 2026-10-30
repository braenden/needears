"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/lazy";

// Seeing the list marks everything as read. RLS limits the update to the
// person's own rows, and only read_at may change.
export function MarkRead() {
  const router = useRouter();
  useEffect(() => {
    void browserClient()
      .then((supabase) =>
        supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .is("read_at", null),
      )
      .then(({ error }) => {
        if (!error) router.refresh();
      });
  }, [router]);
  return null;
}
