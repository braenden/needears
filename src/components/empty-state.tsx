import { cn } from "@/lib/utils";

/**
 * Designed empty state. Texts come from the shared copy. An empty
 * screen is an invitation to act, so pass an action when there is one.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  size = "default",
  className,
}: {
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  size?: "default" | "compact";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        size === "default"
          ? "gap-3 rounded-xl border border-dashed px-6 py-12"
          : "gap-2 px-4 py-8",
        className,
      )}
    >
      {icon ? (
        <div className="mb-1 text-muted-foreground [&_svg]:size-8">{icon}</div>
      ) : (
        <FlatWave className="mb-1" />
      )}
      <p
        className={cn(
          "font-semibold text-balance",
          size === "default" ? "text-lg" : "text-base",
        )}
      >
        {title}
      </p>
      {body ? (
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** A waveform with nothing in it yet: the default empty illustration. */
function FlatWave({ className }: { className?: string }) {
  const heights = [3, 3, 5, 3, 8, 3, 3, 4, 3, 3, 6, 3, 3];
  return (
    <svg
      viewBox="0 0 64 16"
      aria-hidden="true"
      className={cn("h-4 w-16 text-wave", className)}
    >
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 5}
          y={8 - h / 2}
          width="2.5"
          height={h}
          rx="1.25"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
