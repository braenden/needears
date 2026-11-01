import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "rounded-md bg-muted motion-safe:animate-pulse motion-safe:[animation-duration:1.5s]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
