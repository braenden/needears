"use client";

import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
} from "react";

import { currentMinute } from "@/lib/time";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, MINUTE);
  return () => clearInterval(id);
}

// Rounded to the minute so the snapshot is stable between renders.
const getSnapshot = currentMinute;

/** The server's clock when it rendered the page, rounded to the minute. */
const ServerNowContext = createContext<number | null>(null);

/**
 * Hands the server's time to the page, so relative dates read the same in
 * the server's HTML and while hydrating, and do not change after loading.
 */
export function ServerNow({
  value,
  children,
}: {
  value: number;
  children: React.ReactNode;
}) {
  return createElement(ServerNowContext.Provider, { value }, children);
}

/**
 * Current time, rounded to the minute: the server's time while rendering
 * and hydrating (null without a ServerNow above), then the client's. Lets
 * relative dates render without hydration mismatches.
 */
export function useNow() {
  const serverNow = useContext(ServerNowContext);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverNow);
}
