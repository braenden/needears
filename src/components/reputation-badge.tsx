import { EarIcon } from "lucide-react";

import { InfoTip } from "@/components/common/info-tip";
import { Badge } from "@/components/ui/badge";
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

  const classes = cn("h-5 gap-1 px-2 text-[11px]", className);
  const content = (
    <>
      {rep.id !== "new_ear" ? (
        <EarIcon className="size-3" aria-hidden="true" />
      ) : null}
      {rep.name}
    </>
  );

  if (!withTooltip) {
    return (
      <Badge variant={variant} data-level={rep.id} className={classes}>
        {content}
      </Badge>
    );
  }

  // A button, so the explanation opens with a tap as well as on hover.
  return (
    <InfoTip
      content={
        <>
          {rep.description} Marked Helpful {helpful}{" "}
          {helpful === 1 ? "time" : "times"}.
        </>
      }
    >
      <Badge asChild variant={variant} data-level={rep.id} className={classes}>
        <button type="button" className="touch-hit focus-ring outline-none">
          {content}
        </button>
      </Badge>
    </InfoTip>
  );
}
