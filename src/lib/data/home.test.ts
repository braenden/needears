import { describe, expect, it } from "vitest";

import { homeTracks } from "./home";

const track = (id: string, comment_count = 0) => ({ id, comment_count });

describe("homeTracks", () => {
  it("plays the top trending track that has comments, the rest under it", () => {
    const trending = [track("a"), track("b", 2), track("c"), track("d")];
    expect(homeTracks(trending, [track("x", 5)], 3)).toEqual({
      pick: track("b", 2),
      rows: [track("a"), track("c"), track("d")],
      newest: false,
    });
  });

  it("plays the top trending track when none has comments", () => {
    const { pick } = homeTracks([track("a"), track("b")], [track("x", 1)], 3);
    expect(pick).toEqual(track("a"));
  });

  it("shows the newest tracks when nothing is trending", () => {
    const latest = [track("x"), track("y", 2), track("z")];
    expect(homeTracks([], latest, 3)).toEqual({
      pick: track("y", 2),
      rows: [track("x"), track("z")],
      newest: true,
    });
  });

  it("fills the rows with the newest when one track is all that trends", () => {
    const latest = [track("x"), track("a", 1), track("y")];
    expect(homeTracks([track("a", 1)], latest, 3)).toEqual({
      pick: track("a", 1),
      rows: [track("x"), track("y")],
      newest: true,
    });
  });

  it("keeps to the number of rows", () => {
    const latest = [track("a"), track("b"), track("c"), track("d"), track("e")];
    expect(homeTracks([], latest, 3).rows).toHaveLength(3);
  });

  it("is empty when there are no tracks at all", () => {
    expect(homeTracks([], [], 3)).toEqual({
      pick: null,
      rows: [],
      newest: true,
    });
  });
});
