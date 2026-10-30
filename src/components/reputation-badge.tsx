import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { reputationFor } from "@/config/reputation";
import { cn } from "@/lib/utils";

/**
 * Small, discreet reputation chip next to a name. New ears get nothing, so the
 * chip only shows up once someone has actually helped.
 */
export function ReputationBadge({
  helpful,
  showNew = false,
  withTooltip = true,
  className,
}: {
  /** Helpful marks received. */
  helpful: number;
  /** Show "New ear" too, for example on the person's own profile. */
  showNew?: boolean;
  withTooltip?: boolean;
  className?: string;
}) {
  const rep = reputationFor(helpful);
  if (rep.id === "new_ear" && !showNew) return null;

  const variant =
    rep.id === "golden_ear"
      ? "gold"
      : rep.id === "trusted_ear"
        ? "default"
        : "outline";

  const badge = (
    <Badge
      variant={variant}
      data-level={rep.id}
      className={cn("h-5 gap-1 px-2 text-[11px]", className)}
      tabIndex={withTooltip ? 0 : undefined}
    >
      <EarGlyph level={rep.id} />
      {rep.name}
    </Badge>
  );

  if (!withTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-56">
        {rep.description} Marked Helpful {helpful}{" "}
        {helpful === 1 ? "time" : "times"}.
      </TooltipContent>
    </Tooltip>
  );
}

/** Tiny ear arcs: one for Listener, two for Trusted, filled for Golden. */
function EarGlyph({ level }: { level: string }) {
  if (level === "new_ear") return null;
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3" fill="none">
      <path
        d="M4 2.5a4.5 4.5 0 0 0 0 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {level !== "listener" ? (
        <path
          d="M8 2.5a4.5 4.5 0 0 1 0 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : null}
      {level === "golden_ear" ? (
        <circle cx="6" cy="6" r="1.6" fill="currentColor" />
      ) : null}
    </svg>
  );
}
