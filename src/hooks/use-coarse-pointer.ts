"use client";

import { useSyncExternalStore } from "react";

// Phones get the lower file size limit. A coarse pointer is
// a better signal than the screen width for "this is a phone or tablet".
const coarse = "(pointer: coarse)";

function subscribe(callback: () => void) {
  const query = window.matchMedia(coarse);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function useCoarsePointer() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(coarse).matches,
    () => false,
  );
}
