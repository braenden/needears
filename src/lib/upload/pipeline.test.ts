import { describe, expect, it } from "vitest";
import { parseRateLimit } from "./client";
import { parseTags } from "./pipeline";

describe("parseTags", () => {
  it("normalizes, drops invalid tags and caps at five", () => {
    expect(parseTags(" Deep  House, lo-fi,, #bad, a, b, c, d")).toEqual([
      "deep house",
      "lo-fi",
      "a",
      "b",
      "c",
    ]);
  });

  it("removes duplicates", () => {
    expect(parseTags("dub, Dub")).toEqual(["dub"]);
  });
});

describe("parseRateLimit", () => {
  it("reads the daily and weekly limits from the trigger hint", () => {
    expect(parseRateLimit("You can upload 4 tracks per day.")).toEqual({
      limit: 4,
      retry: "tomorrow",
    });
    expect(parseRateLimit("You can upload 6 tracks per week.")).toEqual({
      limit: 6,
      retry: "next week",
    });
  });

  it("falls back to the base limit", () => {
    expect(parseRateLimit(undefined)).toEqual({ limit: 2, retry: "tomorrow" });
  });
});
