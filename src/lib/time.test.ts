import { describe, expect, it } from "vitest";

import { formatTime, parseTime } from "@/lib/time";

describe("formatTime", () => {
  it("formats minutes and seconds", () => {
    expect(formatTime(102_000)).toBe("1:42");
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(3_723_000)).toBe("1:02:03");
  });
});

describe("parseTime", () => {
  it("parses m:ss and h:mm:ss", () => {
    expect(parseTime("1:42")).toBe(102_000);
    expect(parseTime("1:02:03")).toBe(3_723_000);
  });

  it("rejects nonsense", () => {
    expect(parseTime("1:75")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("142")).toBeNull();
  });
});
