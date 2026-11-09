"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

export const THEME_CHOICES = [
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const;

const noop = () => () => {};

/**
 * False on the server and during hydration: the chosen theme is only known
 * in the browser, so anything that shows it waits until then.
 */
export function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** Dark, Light or System side by side: the phone menu, and small in the footer. */
export function ThemeSegments({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "sm";
}) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "grid grid-cols-3 gap-1 rounded-lg bg-muted p-1",
        className,
      )}
    >
      {THEME_CHOICES.map(({ value, label, Icon }) => {
        const checked = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => setTheme(value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md text-muted-foreground",
              "focus-ring transition-colors duration-fast outline-none hover:text-foreground aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-sm",
              size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-9 text-sm",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
