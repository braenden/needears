"use client";

import { useSyncExternalStore } from "react";

// The listening volume, 0 to 1, shared by every player on the site and kept
// in this browser, so it carries over from track to track. Storage can be
// off (private windows); then it is full volume and not remembered.
const KEY = "needears:volume";
const listeners = new Set<() => void>();
let cached: number | null = null;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function read(): number {
  if (cached !== null) return cached;
  try {
    const stored = localStorage.getItem(KEY);
    const value = stored === null ? NaN : Number(stored);
    cached = Number.isFinite(value) ? clamp(value) : 1;
  } catch {
    cached = 1;
  }
  return cached;
}

export function setListenVolume(value: number) {
  cached = clamp(value);
  try {
    localStorage.setItem(KEY, String(cached));
  } catch {
    // Not remembered; this page still uses it.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    cached = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The listening volume, 0 to 1. Full on the server. */
export function useListenVolume(): number {
  return useSyncExternalStore(subscribe, read, () => 1);
}
