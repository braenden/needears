import * as React from "react";
import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";

import { fieldClasses } from "@/components/ui/input";

/**
 * A real <select> (keyboard and the phone picker for free) with the browser's
 * arrow hidden and our own chevron, so it lines up with the field padding.
 * `className` sizes the wrapper, for example "w-44".
 */
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative w-full", className)}>
      <select
        data-slot="native-select"
        className={cn(
          fieldClasses,
          "h-full cursor-pointer appearance-none pr-9 disabled:cursor-not-allowed [&_option]:bg-popover [&_option]:text-popover-foreground",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };
