/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLAIM_WAIT_MS, SharedAudio } from "./shared-audio";

const track = { id: "x", slug: "night-bus-x" };

// jsdom has no audio playback: an element that reports playing until paused.
function playing(shared: SharedAudio) {
  const element = shared.get();
  let paused = false;
  Object.defineProperty(element, "paused", { get: () => paused });
  element.pause = () => {
    paused = true;
  };
  return element;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SharedAudio", () => {
  it("plays on when the track's page takes it over", () => {
    const shared = new SharedAudio();
    const element = playing(shared);
    const feed = {};
    shared.claim(feed, track);
    window.history.pushState({}, "", `/t/${track.slug}`);
    shared.release(feed);
    vi.advanceTimersByTime(0);
    shared.claim({}, track);
    vi.advanceTimersByTime(CLAIM_WAIT_MS * 2);
    expect(element.paused).toBe(false);
  });

  it("stops when the track's page never takes it over", () => {
    const shared = new SharedAudio();
    const element = playing(shared);
    const feed = {};
    shared.claim(feed, track);
    window.history.pushState({}, "", `/t/${track.slug}`);
    shared.release(feed);
    vi.advanceTimersByTime(0);
    expect(element.paused).toBe(false);
    vi.advanceTimersByTime(CLAIM_WAIT_MS);
    expect(element.paused).toBe(true);
  });

  it("stops at once anywhere else", () => {
    const shared = new SharedAudio();
    const element = playing(shared);
    const feed = {};
    shared.claim(feed, track);
    shared.release(feed);
    shared.settle("/t/fast-lane-y");
    expect(element.paused).toBe(true);
  });

  it("stops the old track when another one is claimed", () => {
    const shared = new SharedAudio();
    const element = playing(shared);
    shared.claim({}, track);
    shared.claim({}, { id: "y", slug: "fast-lane-y" });
    expect(element.paused).toBe(true);
  });
});
