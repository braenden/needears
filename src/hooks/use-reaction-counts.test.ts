/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { shareReactionCounts, useReactionCounts } from "./use-reaction-counts";

const counts = (fire: number) => ({ fire, heart: 0, eyes: 0, headphones: 0 });

describe("useReactionCounts", () => {
  it("follows counts shared after the card loaded", () => {
    const loaded = counts(1);
    const { result } = renderHook(() => useReactionCounts("a", loaded));
    expect(result.current).toBe(loaded);
    const newer = counts(2);
    act(() => shareReactionCounts("a", newer));
    expect(result.current).toBe(newer);
  });

  it("keeps fresher counts a card loaded after the share", () => {
    act(() => shareReactionCounts("b", counts(5)));
    const loaded = counts(7);
    const { result } = renderHook(() => useReactionCounts("b", loaded));
    expect(result.current).toBe(loaded);
  });

  it("only follows its own track", () => {
    const loaded = counts(1);
    const { result } = renderHook(() => useReactionCounts("c", loaded));
    act(() => shareReactionCounts("d", counts(9)));
    expect(result.current).toBe(loaded);
  });
});
