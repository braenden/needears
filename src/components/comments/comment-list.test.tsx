/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { comments, threadedComments } from "@/mocks/comments";
import { jonas } from "@/mocks/profiles";

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

const renderThread = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

describe("CommentList threads", () => {
  const topLevel = threadedComments.filter((c) => !c.parent_id);

  it("groups replies under their comment and leaves them out of the counts", () => {
    renderThread(<CommentList comments={threadedComments} viewer="visitor" />);
    expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent(
      String(topLevel.length),
    );
    const replies = screen.getByRole("list", { name: "Replies to Mia" });
    expect(within(replies).getAllByRole("listitem")).toHaveLength(2);
  });

  it("opens a reply box on Reply, sends it, and closes it", async () => {
    const user = userEvent.setup();
    const onReply = vi.fn(async () => ({ ok: true as const }));
    renderThread(
      <CommentList
        comments={threadedComments}
        viewer="visitor"
        onReply={onReply}
      />,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const [first] = screen.getAllByRole("button", { name: "Reply" });
    await user.click(first!);
    const box = screen.getByRole("textbox", { name: /Reply to/ });
    expect(box).toHaveFocus();
    await user.type(box, "Thanks, trying it now");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c5" }),
      "Thanks, trying it now",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("closes the reply box with Escape and refuses an empty reply", async () => {
    const user = userEvent.setup();
    const onReply = vi.fn(async () => ({ ok: true as const }));
    renderThread(
      <CommentList
        comments={threadedComments}
        viewer="visitor"
        onReply={onReply}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: "Reply" })[0]!);
    const form = screen
      .getByRole("textbox", { name: /Reply to/ })
      .closest("form")!;
    await user.click(within(form).getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Write something first.")).toBeInTheDocument();
    expect(onReply).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("asks signed-out listeners to sign in instead of replying", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    renderThread(
      <CommentList
        comments={threadedComments}
        viewer="signed_out"
        onReply={vi.fn()}
        onSignIn={onSignIn}
      />,
    );
    await user.click(
      screen.getAllByRole("button", { name: "Sign in to reply" })[0]!,
    );
    expect(onSignIn).toHaveBeenCalled();
  });

  it("lets the owner resolve and reopen, and hides resolved on request", async () => {
    const user = userEvent.setup();
    const onToggleResolved = vi.fn();
    renderThread(
      <CommentList
        comments={threadedComments}
        viewer="owner"
        onToggleResolved={onToggleResolved}
      />,
    );
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(onToggleResolved).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c3" }),
      false,
    );

    await user.click(screen.getByRole("checkbox", { name: /Show resolved/ }));
    expect(screen.queryByText("Resolved")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent(
      String(topLevel.length - 1),
    );
  });

  it("does not offer Resolve to visitors", () => {
    renderThread(
      <CommentList
        comments={threadedComments}
        viewer="visitor"
        onToggleResolved={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Mark as resolved|Reopen/ }),
    ).not.toBeInTheDocument();
  });
});

describe("CommentList authors", () => {
  it("links each name and handle to the profile", () => {
    renderWithTooltips(<CommentList comments={comments} viewer="visitor" />);
    const link = screen.getAllByRole("link", { name: /@jonas_abl/ })[0]!;
    expect(link).toHaveAttribute("href", "/u/jonas_abl");
  });

  it("marks only the owner's own comments as Uploader", () => {
    const own = comments.find((c) => c.author_id === jonas.id)!;
    // Same name and picture as the owner, different account.
    const impostor = {
      ...own,
      id: "impostor",
      author_id: "someone-else",
      author: { ...jonas, id: "someone-else", handle: "jonas_abl_official" },
    };
    renderWithTooltips(
      <CommentList
        comments={[own, impostor]}
        viewer="visitor"
        ownerId={jonas.id}
      />,
    );
    const [first, second] = items();
    expect(within(first!).getByText("Uploader")).toBeInTheDocument();
    expect(within(second!).queryByText("Uploader")).not.toBeInTheDocument();
    expect(
      within(second!).getByText("@jonas_abl_official"),
    ).toBeInTheDocument();
  });
});

describe("CommentList on a busy track", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    ...comments[0]!,
    id: `many-${i}`,
    parent_id: null,
    time_ms: i * 1000,
  }));

  it("draws 30 at first and the rest on request", async () => {
    const user = userEvent.setup();
    renderWithTooltips(<CommentList comments={many} viewer="visitor" />);
    const list = within(screen.getByRole("tabpanel")).getAllByRole("list")[0]!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(30);
    await user.click(screen.getByRole("button", { name: "Show 10 more" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(40);
    expect(screen.queryByRole("button", { name: /more$/ })).toBeNull();
  });

  it("always draws far enough to show the active comment", () => {
    renderWithTooltips(
      <CommentList
        comments={many}
        viewer="visitor"
        activeCommentId="many-35"
      />,
    );
    const list = within(screen.getByRole("tabpanel")).getAllByRole("list")[0]!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(36);
  });
});
