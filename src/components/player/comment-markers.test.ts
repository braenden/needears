import { describe, expect, it } from "vitest";

import { groupMarkers } from "./comment-markers";

const at = (...seconds: number[]) =>
  seconds.map((s) => ({ time_ms: s * 1000 }));

describe("groupMarkers", () => {
  it("keeps markers apart when there is room", () => {
    // 100 seconds on 1000 pixels: 10 pixels a second.
    const groups = groupMarkers(at(0, 10, 20), 100_000, 1000);
    expect(groups.map((g) => g.comments.length)).toEqual([1, 1, 1]);
    expect(groups.map((g) => g.left)).toEqual([0, 10, 20]);
  });

  it("puts markers closer than 24 pixels in one group, at the first", () => {
    const groups = groupMarkers(at(10, 11, 12, 40), 100_000, 1000);
    expect(groups.map((g) => g.comments.length)).toEqual([3, 1]);
    expect(groups[0]!.left).toBe(10);
  });

  it("groups more on a narrow row", () => {
    const comments = at(10, 13, 16, 19);
    expect(groupMarkers(comments, 100_000, 1000)).toHaveLength(4);
    expect(groupMarkers(comments, 100_000, 260)).toHaveLength(1);
  });
});
