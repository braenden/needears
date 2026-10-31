import { describe, expect, it } from "vitest";

import { nextWeekStart } from "./week";

describe("nextWeekStart", () => {
  it("is the coming Monday at midnight in Oslo", () => {
    // Saturday 31 October 2026, winter time (UTC+1).
    expect(nextWeekStart(Date.parse("2026-10-31T15:00:00Z"))).toBe(
      "2026-11-01T23:00:00.000Z",
    );
  });

  it("counts Sunday night in Oslo as the same week", () => {
    // 23:30 Sunday in Oslo is still Sunday there.
    expect(nextWeekStart(Date.parse("2026-11-01T22:30:00Z"))).toBe(
      "2026-11-01T23:00:00.000Z",
    );
  });

  it("is a week ahead right after the reset", () => {
    expect(nextWeekStart(Date.parse("2026-11-01T23:00:00Z"))).toBe(
      "2026-11-08T23:00:00.000Z",
    );
  });

  it("uses summer time when Monday is in summer", () => {
    // Wednesday 10 June 2026, UTC+2.
    expect(nextWeekStart(Date.parse("2026-06-10T12:00:00Z"))).toBe(
      "2026-06-14T22:00:00.000Z",
    );
  });
});
