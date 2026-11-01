/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { moveReaction, ReactionBar } from "./reaction-bar";

const counts = { fire: 2, heart: 1, eyes: 0, headphones: 0 };

describe("moveReaction", () => {
  it("adds, moves and takes back one reaction", () => {
    expect(moveReaction(counts, null, "eyes")).toEqual({ ...counts, eyes: 1 });
    expect(moveReaction(counts, "fire", "heart")).toEqual({
      ...counts,
      fire: 1,
      heart: 2,
    });
    expect(moveReaction(counts, "heart", null)).toEqual({
      ...counts,
      heart: 0,
    });
    expect(moveReaction(counts, "fire", "fire")).toBe(counts);
  });

  it("never goes below zero", () => {
    expect(moveReaction(counts, "eyes", null).eyes).toBe(0);
  });
});

describe("ReactionBar", () => {
  it("presses only the viewer's reaction", () => {
    render(<ReactionBar counts={counts} mine="fire" signedIn />);
    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Fire, 2",
    ]);
  });

  it("picks another reaction, or takes the same one back", async () => {
    const onPick = vi.fn();
    render(
      <ReactionBar counts={counts} mine="fire" signedIn onPick={onPick} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Love, 1" }));
    expect(onPick).toHaveBeenLastCalledWith("heart");
    await userEvent.click(screen.getByRole("button", { name: "Fire, 2" }));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it("asks people who are signed out to sign in", async () => {
    const onPick = vi.fn();
    const onSignIn = vi.fn();
    render(
      <ReactionBar
        counts={counts}
        mine={null}
        signedIn={false}
        onPick={onPick}
        onSignIn={onSignIn}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Fire, 2" }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(onPick).not.toHaveBeenCalled();
  });
});
