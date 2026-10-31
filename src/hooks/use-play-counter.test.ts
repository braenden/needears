/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatPlays, listenedAfter, playThresholdMs } from "@/lib/plays";

import { usePlayCounter } from "./use-play-counter";

describe("play helpers", () => {
  it("counts after 30 seconds, or the whole track when it is shorter", () => {
    expect(playThresholdMs(180_000)).toBe(30_000);
    expect(playThresholdMs(18_000)).toBe(17_000);
    expect(playThresholdMs(1_500)).toBe(1_000);
  });

  it("adds one-second steps and ignores seeks", () => {
    expect(listenedAfter(0, null, 0)).toBe(0);
    expect(listenedAfter(0, 0, 1000)).toBe(1000);
    expect(listenedAfter(1000, 1000, 61_000)).toBe(1000);
    expect(listenedAfter(1000, 61_000, 5_000)).toBe(1000);
  });

  it("formats the count", () => {
    expect(formatPlays(1)).toBe("1 play");
    expect(formatPlays(1380)).toBe("1,380 plays");
  });
});

describe("usePlayCounter", () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const play = (report: (ms: number) => void, from: number, to: number) => {
    for (let ms = from; ms <= to; ms += 1000) report(ms);
  };

  it("sends one play after 30 seconds of listening", () => {
    const { result } = renderHook(() => usePlayCounter("t1", 180_000));
    play(result.current, 0, 29_000);
    expect(fetchMock).not.toHaveBeenCalled();
    play(result.current, 30_000, 90_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/tracks/t1/play", {
      method: "POST",
      keepalive: true,
    });
  });

  it("does not count skipping ahead", () => {
    const { result } = renderHook(() => usePlayCounter("t1", 180_000));
    play(result.current, 0, 5_000);
    result.current(120_000);
    play(result.current, 120_000, 130_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts a track once per browser session", () => {
    const first = renderHook(() => usePlayCounter("t1", 180_000));
    play(first.result.current, 0, 31_000);
    const again = renderHook(() => usePlayCounter("t1", 180_000));
    play(again.result.current, 0, 31_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
