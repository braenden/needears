"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * The line under the current tab, sliding over when the tab changes. Sits
 * in the element that holds the tabs (positioned relative) and follows
 * the one that matches `selector`, such as `[aria-current="page"]`. Until
 * it has measured, the tabs keep their own underline: it marks the holder
 * with data-underline="ready" for them to hide theirs.
 */
export function SlidingUnderline({
  selector,
  className,
}: {
  selector: string;
  className?: string;
}) {
  const bar = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const line = bar.current;
    const host = line?.parentElement;
    if (!line || !host) return;
    let placed = false;
    const place = () => {
      const active = host.querySelector<HTMLElement>(selector);
      if (!active) {
        line.style.opacity = "0";
        return;
      }
      const from = host.getBoundingClientRect();
      const to = active.getBoundingClientRect();
      // The first placement jumps; only changes slide.
      if (!placed) line.style.transition = "none";
      line.style.width = `${to.width}px`;
      line.style.translate = `${to.left - from.left + host.scrollLeft}px 0`;
      line.style.opacity = "1";
      if (!placed) {
        void line.offsetWidth;
        line.style.transition = "";
        placed = true;
        host.dataset.underline = "ready";
      }
    };
    place();
    const changes = new MutationObserver(place);
    changes.observe(host, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-current", "data-state", "aria-selected"],
    });
    const sizes =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    sizes?.observe(host);
    return () => {
      changes.disconnect();
      sizes?.disconnect();
      delete host.dataset.underline;
    };
  }, [selector]);

  return (
    <span
      ref={bar}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary opacity-0 transition-[translate,width] duration-base ease-move motion-reduce:transition-none",
        className,
      )}
    />
  );
}
