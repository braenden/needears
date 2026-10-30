import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  reputationLevelFor,
  reputationLevels,
  reputationSeedSql,
} from "./reputation";

describe("reputation levels", () => {
  it("uses the thresholds from the plan", () => {
    expect(reputationLevels.map((l) => [l.name, l.minHelpful])).toEqual([
      ["New ear", 0],
      ["Listener", 3],
      ["Trusted ear", 15],
      ["Golden ear", 60],
    ]);
  });

  it("is sorted and never lowers limits for a higher level", () => {
    for (let i = 1; i < reputationLevels.length; i++) {
      const prev = reputationLevels[i - 1]!;
      const next = reputationLevels[i]!;
      expect(next.minHelpful).toBeGreaterThan(prev.minHelpful);
      for (const key of Object.keys(
        prev.limits,
      ) as (keyof typeof prev.limits)[]) {
        expect(next.limits[key]).toBeGreaterThanOrEqual(prev.limits[key]);
      }
    }
  });

  it.each([
    [0, "new_ear"],
    [2, "new_ear"],
    [3, "listener"],
    [14, "listener"],
    [15, "trusted_ear"],
    [60, "golden_ear"],
    [1000, "golden_ear"],
  ])("maps %i helpful marks to %s", (helpful, id) => {
    expect(reputationLevelFor(helpful).id).toBe(id);
  });

  it("matches supabase/seeds/reputation.sql (run `pnpm db:config` if this fails)", () => {
    const file = readFileSync(
      new URL("../../supabase/seeds/reputation.sql", import.meta.url),
      "utf8",
    );
    expect(file).toBe(reputationSeedSql());
  });
});
