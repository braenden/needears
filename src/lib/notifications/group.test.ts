import { describe, expect, it } from "vitest";

import { groupNotifications, namesText } from "./group";

const hour = 3_600_000;
const start = Date.parse("2026-11-01T12:00:00Z");
const row = (
  kind: string,
  actor: string,
  slug: string | null,
  hoursAgo: number,
) => ({
  kind,
  created_at: new Date(start - hoursAgo * hour).toISOString(),
  read_at: null,
  actor: { id: actor },
  track: slug ? { slug } : null,
});

describe("groupNotifications", () => {
  it("groups the same kind on the same track within a day", () => {
    const groups = groupNotifications([
      row("comment", "jonas", "night-bus", 0),
      row("comment", "mia", "night-bus", 2),
      row("helpful", "mia", "night-bus", 3),
      row("comment", "jonas", "night-bus", 5),
      row("comment", "ola", "fast-lane", 6),
    ]);
    expect(groups.map((g) => g.items.length)).toEqual([3, 1, 1]);
    expect(groups[0]!.actors.map((a) => a.id)).toEqual(["jonas", "mia"]);
  });

  it("starts a new row after a day", () => {
    const groups = groupNotifications([
      row("comment", "jonas", "night-bus", 0),
      row("comment", "mia", "night-bus", 30),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("never groups moderation notices", () => {
    const groups = groupNotifications([
      row("moderation", "mod", "night-bus", 0),
      row("moderation", "mod", "night-bus", 1),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("namesText", () => {
  it("names one, two or the first and a count", () => {
    expect(namesText(["Jonas"])).toBe("Jonas");
    expect(namesText(["Jonas", "Mia"])).toBe("Jonas and Mia");
    expect(namesText(["Jonas", "Mia", "Ola", "Kari"])).toBe(
      "Jonas and 3 others",
    );
  });
});
