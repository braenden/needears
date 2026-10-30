import { describe, expect, it } from "vitest";
import { clampPage, reactionCounts } from "./parse";

describe("clampPage", () => {
  it.each([
    [undefined, 1],
    ["2", 2],
    ["0", 1],
    ["-3", 1],
    ["abc", 1],
    ["999999", 50],
    [["3", "4"], 3],
  ])("reads %j as %i", (value, expected) => {
    expect(clampPage(value)).toBe(expected);
  });
});

describe("reactionCounts", () => {
  it("fills in missing kinds and ignores junk", () => {
    expect(reactionCounts({ fire: 3, heart: "x", other: 9 })).toEqual({
      fire: 3,
      heart: 0,
      eyes: 0,
      headphones: 0,
    });
    expect(reactionCounts(null)).toEqual({
      fire: 0,
      heart: 0,
      eyes: 0,
      headphones: 0,
    });
  });
});
