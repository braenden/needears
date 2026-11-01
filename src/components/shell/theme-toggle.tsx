"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("touch-hit", className)}
      onClick={() => setTheme(isLight ? "dark" : "light")}
      aria-label="Light theme"
      aria-pressed={isLight}
    >
      <SunIcon className="hidden in-[.light]:block" />
      <MoonIcon className="block in-[.light]:hidden" />
    </Button>
  );
}
