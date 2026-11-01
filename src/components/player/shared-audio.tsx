"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * One audio element for the whole site, so a track playing in the feed keeps
 * playing when someone opens its page. Players borrow it: whoever plays
 * claims it with the track, and lets go when it leaves the page. If the next
 * page is that track's own page, it plays on (that page claims it in turn);
 * anywhere else it stops, as before.
 */
export class SharedAudio {
  private element: HTMLAudioElement | null = null;
  private owner: object | null = null;
  private waiting: ReturnType<typeof setTimeout> | null = null;
  /** The track in the element and its page, while one is loaded. */
  track: { id: string; slug: string } | null = null;

  /** The element, made on first use (never on the server). */
  get(): HTMLAudioElement {
    this.element ??= new Audio();
    return this.element;
  }

  /** True when the element holds this track and is playing it. */
  isPlaying(trackId: string) {
    return this.track?.id === trackId && !!this.element && !this.element.paused;
  }

  /** What it is playing this track from, if it is; null on the server. */
  playingSrc(trackId: string): string | null {
    return this.isPlaying(trackId) ? (this.element?.src ?? null) : null;
  }

  holds(owner: object) {
    return this.owner === owner;
  }

  claim(owner: object, track: { id: string; slug: string }) {
    if (this.waiting) clearTimeout(this.waiting);
    this.waiting = null;
    // Another track: what was playing stops.
    if (this.track && this.track.id !== track.id) this.element?.pause();
    this.owner = owner;
    this.track = track;
  }

  /** Lets go. Playing on only makes sense on the track's own page. */
  release(owner: object) {
    if (this.owner !== owner) return;
    this.owner = null;
    // The new page may already be showing, or still be on its way: check
    // once this navigation has settled.
    setTimeout(() => this.settle(window.location.pathname), 0);
  }

  /**
   * Called when the page changes: stop anything nobody holds. On the track's
   * own page it plays on for a moment, and stops unless that page takes it
   * over (it may not, if the track is no longer there).
   */
  settle(pathname: string) {
    if (this.owner || !this.element || this.element.paused) return;
    if (this.track && pathname === `/t/${this.track.slug}`) {
      this.waiting ??= setTimeout(() => {
        this.waiting = null;
        if (!this.owner) this.element?.pause();
      }, CLAIM_WAIT_MS);
      return;
    }
    this.element.pause();
  }
}

/** How long the track's page has to take over what the feed was playing. */
export const CLAIM_WAIT_MS = 4000;

const Context = createContext<SharedAudio | null>(null);

export function SharedAudioProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [shared] = useState(() => new SharedAudio());
  const pathname = usePathname();
  useEffect(() => {
    shared.settle(pathname);
  }, [shared, pathname]);
  return <Context value={shared}>{children}</Context>;
}

// Pages outside the site frame (the /design gallery) get one of their own.
let standalone: SharedAudio | null = null;

export function useSharedAudio(): SharedAudio {
  const shared = useContext(Context);
  if (shared) return shared;
  standalone ??= new SharedAudio();
  return standalone;
}
