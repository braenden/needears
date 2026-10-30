import { cn } from "@/lib/utils";

/**
 * The Need Ears mark: a short waveform with one comment marker above it. It
 * sits on a 32 unit grid so it stays crisp at 16 px (favicon). The bars use
 * currentColor, the marker uses the primary token. src/app/icon.svg is the
 * same drawing with fixed colours.
 */
export function LogoMark({
  title,
  className,
  ...props
}: React.ComponentProps<"svg"> & {
  /** Accessible name. Leave empty when a visible wordmark sits next to it. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("size-8 shrink-0", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect
        x="3"
        y="15"
        width="4.5"
        height="10"
        rx="2.25"
        fill="currentColor"
      />
      <rect
        x="10"
        y="9"
        width="4.5"
        height="22"
        rx="2.25"
        fill="currentColor"
      />
      <rect
        x="17"
        y="17"
        width="4.5"
        height="8"
        rx="2.25"
        fill="currentColor"
      />
      <rect
        x="24"
        y="12"
        width="4.5"
        height="16"
        rx="2.25"
        fill="currentColor"
      />
      <circle cx="19.25" cy="7.5" r="4" fill="var(--primary)" />
    </svg>
  );
}

/**
 * The wordmark "need ears", drawn as monoline lowercase so it shares stroke
 * weight with the marks. Drawn, not typeset, so it renders the same
 * everywhere and needs no font.
 */
export function Wordmark({
  className,
  title = "Need Ears",
  ...props
}: React.ComponentProps<"svg"> & { title?: string }) {
  return (
    <svg
      viewBox="-2 2.5 123 23"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      className={cn("h-5 w-auto shrink-0", className)}
      {...props}
    >
      <title>{title}</title>
      <g
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* n */}
        <path d="M0 12v12M0 24v-7a5 5 0 0 1 10 0v7" />
        {/* e */}
        <path d="M14 18h12a6 6 0 1 0-1.76 4.24" />
        {/* e */}
        <path d="M30 18h12a6 6 0 1 0-1.76 4.24" />
        {/* d */}
        <path d="M58 4v20M46 18a6 6 0 1 0 12 0a6 6 0 1 0-12 0" />
        {/* e */}
        <path d="M67 18h12a6 6 0 1 0-1.76 4.24" />
        {/* a */}
        <path d="M95 12v12M83 18a6 6 0 1 0 12 0a6 6 0 1 0-12 0" />
        {/* r */}
        <path d="M100 12v12M100 18a6 6 0 0 1 6-6h1" />
        {/* s */}
        <path d="M119 13.5c-1-1.1-2.4-1.5-4-1.5c-2.5 0-4 1.4-4 3c0 1.8 1.6 2.5 4 3s4 1.2 4 3c0 1.6-1.5 3-4 3c-1.6 0-3-.4-4-1.5" />
      </g>
    </svg>
  );
}

/** Mark and wordmark side by side, as used in the top bar. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-7" />
      <Wordmark className="h-[18px]" />
    </span>
  );
}
