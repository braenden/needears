import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { rankLeaders } = await import("./weekly");

describe("rankLeaders", () => {
  it("sorts by Helpful, shares ranks on ties and keeps ten", () => {
    const rows = [3, 9, 9, 1, 5, 2, 2, 8, 7, 6, 4, 1].map((helpful, i) => ({
      id: String(i),
      helpful,
    }));
    const ranked = rankLeaders(rows);
    expect(ranked).toHaveLength(10);
    expect(ranked.map((r) => [r.helpful, r.rank])).toEqual([
      [9, 1],
      [9, 1],
      [8, 3],
      [7, 4],
      [6, 5],
      [5, 6],
      [4, 7],
      [3, 8],
      [2, 9],
      [2, 9],
    ]);
  });
});
