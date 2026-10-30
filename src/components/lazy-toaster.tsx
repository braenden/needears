"use client";

import dynamic from "next/dynamic";

// Toasts only appear after something happens on the page, so the toaster
// can load after the first paint.
export const LazyToaster = dynamic(
  () => import("@/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false },
);
