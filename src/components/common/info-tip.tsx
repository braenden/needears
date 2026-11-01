"use client";

import { useRef, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * A short explanation for a small badge or icon. Opens on tap (tooltips
 * cannot be opened on touch screens) and on hover with a mouse.
 */
export function InfoTip({
  children,
  content,
}: {
  /** The trigger: one focusable element, such as a button. */
  children: React.ReactElement;
  content: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hovered = useRef(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        asChild
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          hovered.current = true;
          setOpen(true);
        }}
        // A click after hovering keeps it open instead of closing it.
        onClick={(event) => {
          if (hovered.current) event.preventDefault();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse" || !hovered.current) return;
          hovered.current = false;
          setOpen(false);
        }}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        // Hovering opens it without moving focus into it.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
