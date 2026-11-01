import { PauseIcon, PlayIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Play and pause on top of each other, fading from one to the other. */
export function PlayPauseIcon({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden="true" className="grid *:col-start-1 *:row-start-1">
      <PlayIcon
        className={cn(
          "translate-x-px fill-current transition-opacity duration-fast",
          playing && "opacity-0",
        )}
      />
      <PauseIcon
        className={cn(
          "fill-current transition-opacity duration-fast",
          !playing && "opacity-0",
        )}
      />
    </span>
  );
}
