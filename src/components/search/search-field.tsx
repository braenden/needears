"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";

import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const SEARCH_MIN_LENGTH = 2;

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
  className,
}: {
  defaultValue?: string;
  /** Listen for /. Only one field on a page should. */
  shortcut?: boolean;
  action?: string;
  /** Name of the search landmark. Must be unique if a page has more than one. */
  formLabel?: string;
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
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
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
        aria-keyshortcuts={shortcut ? "/" : undefined}
        className={cn(
          fieldClasses,
          "h-9 bg-muted/60 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {shortcut && !value && !focused ? (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-xs border bg-background px-1.5 font-sans text-xs text-muted-foreground"
        >
          /
        </kbd>
      ) : null}
    </form>
  );
}
