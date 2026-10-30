import { cn } from "@/lib/utils";

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-20 border-t pt-10 pb-6"
    >
      <h2
        id={`${id}-title`}
        className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-prose text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mt-6 grid gap-8">{children}</div>
    </section>
  );
}

export function Example({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      ) : null}
      <div className={cn("mt-3", className)}>{children}</div>
    </div>
  );
}

/** Renders children twice, once forced dark and once forced light. */
export function ThemePanels({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {(["dark", "light"] as const).map((theme) => (
        <div
          key={theme}
          className={cn(
            theme,
            "rounded-xl border bg-background p-4 text-foreground",
            className,
          )}
        >
          <p className="mb-3 text-xs text-muted-foreground">
            {theme === "dark" ? "Dark (default)" : "Light"}
          </p>
          {children}
        </div>
      ))}
    </div>
  );
}

/** A 375 px wide frame. Components use container queries, so this is their real phone layout. */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[375px] overflow-hidden rounded-[2rem] border-[6px] border-secondary bg-background">
      <div className="max-h-[720px] overflow-y-auto">{children}</div>
    </div>
  );
}
