"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

// Fast navigations finish before the bar would show, so they never flash it.
const SHOW_AFTER_MS = 150;

/** The internal page a click on this link leads to, or null. */
function destination(event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return null;
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return null;
  if (link.target && link.target !== "_self") return null;
  if (link.hasAttribute("download")) return null;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return null;
  // Same page, or a jump within it: nothing to wait for.
  if (url.pathname === location.pathname && url.search === location.search)
    return null;
  return url.pathname + url.search;
}

/**
 * A thin line at the top of the page while a clicked link loads, so a slow
 * page never feels like a dead click. It creeps towards the end and
 * finishes when the new page is in.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = `${pathname}?${search}`;
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [shown, setShown] = useState(here);
  const timer = useRef<number | undefined>(undefined);

  // The new page is in: finish, then fade out.
  if (shown !== here) {
    setShown(here);
    setPhase((current) => (current === "loading" ? "done" : "idle"));
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!destination(event)) return;
      const from = location.pathname + location.search;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        // Already there: it was quick enough to need no bar.
        if (location.pathname + location.search === from) setPhase("loading");
      }, SHOW_AFTER_MS);
    };
    // Before the links' own handlers: Next's links cancel the browser's
    // navigation to do their own, so defaultPrevented says nothing here.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "idle") return;
    // Done: let it fade. Still loading after this long: the navigation
    // went nowhere (cancelled, or the link only changed the hash), so stop.
    const next = window.setTimeout(
      () => setPhase(phase === "done" ? "idle" : "done"),
      phase === "done" ? 400 : 10_000,
    );
    return () => window.clearTimeout(next);
  }, [phase]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5"
    >
      <div
        data-phase={phase}
        className={cn(
          "h-full origin-left scale-x-0 bg-primary opacity-0",
          // Creeps most of the way while waiting.
          "data-[phase=loading]:scale-x-80 data-[phase=loading]:opacity-100 data-[phase=loading]:transition-[scale] data-[phase=loading]:duration-[8s] data-[phase=loading]:ease-out-soft",
          // Runs to the end, then fades.
          "data-[phase=done]:scale-x-100 data-[phase=done]:transition-[scale,opacity] data-[phase=done]:delay-[0s,var(--duration-base)] data-[phase=done]:duration-base data-[phase=done]:ease-move",
        )}
      />
    </div>
  );
}
