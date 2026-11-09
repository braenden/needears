"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";

import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Search box for the top bar. A plain GET form to /search, so it works before
 * JavaScript loads. Press / anywhere to jump to it, Escape to leave it.
 */
export function SearchField({
  defaultValue = "",
  shortcut = true,
  action = "/search",
  formLabel = "Search",
  autoFocus = false,
  size = "default",
  className,
}: {
  defaultValue?: string;
  /** Listen for /. Only one field on a page should. */
  shortcut?: boolean;
  action?: string;
  /** Name of the search landmark. Must be unique if a page has more than one. */
  formLabel?: string;
  /** Focus it on arrival, so the keyboard is ready. */
  autoFocus?: boolean;
  /** "lg": the search page's own field. */
  size?: "default" | "lg";
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (isEditable(event.target) || document.querySelector("[role=dialog]"))
        return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);

  return (
    <form
      role="search"
      aria-label={formLabel}
      action={action}
      method="get"
      className={cn("relative", className)}
    >
      <label htmlFor={`${id}-q`} className="sr-only">
        Search tracks and people
      </label>
      <SearchIcon
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
          size === "lg" ? "left-3.5 size-5" : "left-2.5 size-4",
        )}
      />
      <input
        ref={inputRef}
        id={`${id}-q`}
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") inputRef.current?.blur();
        }}
        placeholder="Search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        autoFocus={autoFocus}
        aria-keyshortcuts={shortcut ? "/" : undefined}
        className={cn(
          fieldClasses,
          "bg-muted/60 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden",
          size === "lg"
            ? "h-12 rounded-lg pl-10 text-base sm:text-base"
            : "h-9",
        )}
      />
      {shortcut && !value && !focused ? (
        <kbd
          aria-hidden="true"
          // Only with a keyboard and mouse, like the other key hints.
          className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-xs border bg-background px-1.5 font-sans text-xs text-muted-foreground fine:block"
        >
          /
        </kbd>
      ) : null}
    </form>
  );
}
