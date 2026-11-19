import { LockIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The mark of a group where it meets the rest of the site. Decoration:
 * words beside it always say the same.
 */
export function Lock({ className }: { className?: string }) {
  return (
    <LockIcon
      aria-hidden="true"
      className={cn(
        "inline size-[0.8em] shrink-0 -translate-y-px text-muted-foreground",
        className,
      )}
    />
  );
}
