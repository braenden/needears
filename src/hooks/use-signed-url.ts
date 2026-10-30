"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { freshAudioUrl } from "@/app/actions/media";

// Signed URLs live for an hour. Treat them as stale a bit before that.
const STALE_MS = 50 * 60 * 1000;

// Keeps a track's signed audio URL usable on a page left open for a long
// time: when the tab comes back after the URL went stale, it asks for a
// new one.
export function useSignedUrl(slug: string, initialUrl: string | null) {
  const [url, setUrl] = useState(initialUrl);
  const signedAt = useRef(0);

  useEffect(() => {
    signedAt.current = Date.now();
  }, [initialUrl]);

  const refresh = useCallback(async () => {
    const next = await freshAudioUrl(slug);
    signedAt.current = Date.now();
    if (next) setUrl(next);
    return next;
  }, [slug]);

  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - signedAt.current > STALE_MS
      )
        void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return url;
}
