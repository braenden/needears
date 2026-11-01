"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * One row in the list. The page marks everything read as soon as it is
 * seen and then reloads its data; the row keeps how it was when it came,
 * so what is new stays marked while you are here.
 */
export function NotificationRow({
  unread,
  className,
  children,
}: {
  unread: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [wasUnread] = useState(unread);
  return (
    <li className={cn(className, wasUnread && "bg-primary-soft/40")}>
      {children}
      {wasUnread ? <span className="sr-only"> (new)</span> : null}
    </li>
  );
}
