/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { comments } from "@/mocks/comments";

import {
  activeCommentAt,
  CommentList,
  filterComments,
  sortComments,
} from "./comment-list";

// Reputation badges show a tooltip, which needs the provider from the root layout.
const renderWithTooltips = (ui: React.ReactElement) =>
  render(ui, { wrapper: TooltipProvider });

const items = () =>
  within(screen.getByRole("tabpanel")).queryAllByRole("listitem");

describe("filterComments", () => {
  it("keeps only Helpful comments", () => {
    expect(filterComments(comments, "helpful").every((c) => c.is_helpful)).toBe(
      true,
    );
  });

  it("keeps only comments from Trusted and Golden ears", () => {
    const trusted = filterComments(comments, "trusted");
    expect(trusted.length).toBeGreaterThan(0);
    expect(trusted.every((c) => c.author.reputation >= 15)).toBe(true);
  });
});

describe("sortComments and activeCommentAt", () => {
  it("puts whole-track comments first, then playback order", () => {
    const sorted = sortComments(comments, "time");
    expect(sorted[0]!.time_ms).toBeNull();
    const times = sorted.slice(1).map((c) => c.time_ms!);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("finds the comment the playhead last passed", () => {
    expect(activeCommentAt(comments, 110_000)?.id).toBe("c1");
    expect(activeCommentAt(comments, 10_000)).toBeNull();
  });
});

describe("CommentList filter", () => {
  it("switches between All, Helpful and From trusted ears", async () => {
    const user = userEvent.setup();
    renderWithTooltips(<CommentList comments={comments} viewer="visitor" />);
    expect(items()).toHaveLength(comments.length);

    await user.click(screen.getByRole("tab", { name: /Helpful/ }));
    expect(items()).toHaveLength(filterComments(comments, "helpful").length);

    await user.click(screen.getByRole("tab", { name: /From trusted ears/ }));
    const trusted = filterComments(comments, "trusted");
    expect(items()).toHaveLength(trusted.length);
    expect(screen.queryByText("Nora")).not.toBeInTheDocument();
  });

  it("shows an empty state with Show all when a filter has no matches", async () => {
    const user = userEvent.setup();
    renderWithTooltips(
      <CommentList
        comments={comments.filter((c) => !c.is_helpful)}
        viewer="visitor"
        defaultFilter="helpful"
      />,
    );
    expect(screen.getByText("No Helpful comments yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByRole("tab", { name: /All/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(items().length).toBeGreaterThan(0);
  });

  it("lets the owner mark a comment as Helpful", async () => {
    const user = userEvent.setup();
    const onToggleHelpful = vi.fn();
    const notHelpful = comments.filter((c) => !c.is_helpful).slice(0, 1);
    renderWithTooltips(
      <CommentList
        comments={notHelpful}
        viewer="owner"
        onToggleHelpful={onToggleHelpful}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Mark as Helpful" }));
    expect(onToggleHelpful).toHaveBeenCalledWith(notHelpful[0], true);
  });

  it("jumps to the comment's time", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    renderWithTooltips(
      <CommentList comments={comments} viewer="signed_out" onJump={onJump} />,
    );
    await user.click(screen.getByRole("button", { name: "Jump to 1:42" }));
    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });
});
