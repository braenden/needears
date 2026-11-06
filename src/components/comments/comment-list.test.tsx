/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { comments, threadedComments } from "@/mocks/comments";
import { displayNameOf } from "@/components/common/user-avatar";
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

/** The threads, without their replies. */
const items = () => {
  const list = screen.queryByRole("list", { name: "Comments" });
  return list
    ? within(list)
        .queryAllByRole("listitem")
        .filter((li) => li.parentElement === list)
    : [];
};

/** Picks from the list's one menu: order, which comments, resolved. */
async function pick(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
  role: "menuitemradio" | "menuitemcheckbox" = "menuitemradio",
) {
  await user.click(screen.getByRole("button", { name: /^Comments:/ }));
  await user.click(screen.getByRole(role, { name }));
}

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

    await pick(user, /^Helpful/);
    expect(items()).toHaveLength(filterComments(comments, "helpful").length);

    await pick(user, /^From trusted ears/);
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
    expect(
      screen.getByRole("button", { name: /^Comments:/ }),
    ).toHaveTextContent(/^Comments: By time$/);
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
    const helpful = screen.getByRole("button", { name: "Helpful" });
    expect(helpful).toHaveAttribute("aria-pressed", "false");
    await user.click(helpful);
    expect(onToggleHelpful).toHaveBeenCalledWith(notHelpful[0], true);
  });

  it("jumps to the comment's time", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    renderWithTooltips(
      <CommentList comments={comments} viewer="signed_out" onJump={onJump} />,
    );
    await user.click(screen.getByRole("button", { name: "Play from 1:42" }));
    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });
});

const renderThread = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

/**
 * What the heading counts: the comments the list shows (resolved ones are
 * folded away) and their replies.
 */
function shownCount(list: typeof threadedComments) {
  const top = list.filter((c) => !c.parent_id && !c.resolved_at);
  const ids = new Set(top.map((c) => c.id));
  return (
    top.filter((c) => c.status !== "withdrawn").length +
    list.filter((c) => c.parent_id && ids.has(c.parent_id)).length
  );
}

describe("CommentList threads", () => {
  const topLevel = threadedComments.filter((c) => !c.parent_id);

  it("groups replies under their comment and counts what the list shows", () => {
    renderThread(
      <CommentList
        comments={threadedComments}
        viewer="visitor"
        heading={{ id: "h", text: "Comments" }}
      />,
    );
    expect(screen.getByRole("heading", { name: /Comments/ })).toHaveTextContent(
      `Comments ${shownCount(threadedComments)}`,
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
    await user.click(screen.getAllByRole("button", { name: "Reply" })[0]!);
    expect(onSignIn).toHaveBeenCalled();
  });

  it("keeps resolved comments at the bottom, and lets the owner resolve", async () => {
    const user = userEvent.setup();
    const onToggleResolved = vi.fn();
    renderThread(
      <CommentList
        comments={threadedComments}
        viewer="owner"
        onToggleResolved={onToggleResolved}
      />,
    );
    const open = topLevel.length - 1;
    expect(items()).toHaveLength(open);
    await user.click(
      screen.getByRole("button", { name: "1 resolved comment" }),
    );
    expect(items()).toHaveLength(topLevel.length);
    await user.click(
      screen.getByRole("button", { name: "Hide resolved comments" }),
    );
    expect(items()).toHaveLength(open);

    // The same from the menu.
    await pick(user, /^Show resolved/, "menuitemcheckbox");
    expect(items()).toHaveLength(topLevel.length);

    await user.click(
      screen.getAllByRole("button", {
        name: /More actions for the comment/,
      })[0]!,
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Mark as resolved" }),
    );
    expect(onToggleResolved).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("does not offer Resolve to visitors", async () => {
    const user = userEvent.setup();
    renderThread(
      <CommentList
        comments={threadedComments}
        viewer="visitor"
        onToggleResolved={vi.fn()}
      />,
    );
    await user.click(
      screen.getAllByRole("button", {
        name: /More actions for the comment/,
      })[0]!,
    );
    expect(
      screen.queryByRole("menuitem", { name: /Mark as resolved|Reopen/ }),
    ).not.toBeInTheDocument();
  });
});

describe("CommentList authors", () => {
  it("links each name to the profile", () => {
    renderWithTooltips(<CommentList comments={comments} viewer="visitor" />);
    const link = screen.getAllByRole("link", {
      name: displayNameOf(jonas),
    })[0]!;
    expect(link).toHaveAttribute("href", "/u/jonas_abl");
  });

  it("marks only the artist's own replies as Artist", () => {
    const parent = comments.find((c) => c.author_id !== jonas.id)!;
    const reply = {
      ...comments.find((c) => c.author_id === jonas.id)!,
      id: "from-artist",
      parent_id: parent.id,
    };
    // Same name and picture as the artist, different account.
    const impostor = {
      ...reply,
      id: "impostor",
      author_id: "someone-else",
      author: { ...jonas, id: "someone-else", handle: "jonas_abl_official" },
    };
    renderWithTooltips(
      <CommentList
        comments={[parent, reply, impostor]}
        viewer="visitor"
        ownerId={jonas.id}
      />,
    );
    const replies = within(
      screen.getByRole("list", { name: /^Replies to/ }),
    ).getAllByRole("listitem");
    expect(within(replies[0]!).getByText(/Artist/)).toBeInTheDocument();
    expect(within(replies[1]!).queryByText(/Artist/)).not.toBeInTheDocument();
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
    const list = screen.getByRole("list", { name: "Comments" });
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
    const list = screen.getByRole("list", { name: "Comments" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(36);
    // Drawn, but not marked: the list has no "playing now" line.
    expect(list.querySelector("[aria-current]")).toBeNull();
  });
});

describe("CommentList with a deleted comment", () => {
  const withdraw = (id: string) =>
    threadedComments.map((c) =>
      c.id === id
        ? {
            ...c,
            status: "withdrawn" as const,
            body: "",
            author_id: "",
            is_helpful: false,
            author: {
              id: "",
              handle: "",
              display_name: "",
              avatar_url: null,
              reputation: 0,
            },
          }
        : c,
    );

  it("keeps its replies under Comment deleted and counts only the replies", () => {
    const list = withdraw("c1");
    renderWithTooltips(
      <CommentList
        comments={list}
        viewer="visitor"
        heading={{ id: "h", text: "Comments" }}
      />,
    );
    const kept = screen.getByText("Comment deleted").closest("li")!;
    expect(
      within(kept).getByText(/Is that cut on the snare bus/),
    ).toBeInTheDocument();
    // Nothing to act on.
    expect(within(kept).queryByRole("button", { name: /^Reply$/ })).toBeNull();
    expect(screen.getByRole("heading", { name: /Comments/ })).toHaveTextContent(
      `Comments ${shownCount(list)}`,
    );
  });

  it("stays resolved: Show resolved hides it and brings it back", async () => {
    const user = userEvent.setup();
    const list = withdraw("c1").map((c) =>
      c.id === "c1" ? { ...c, resolved_at: "2026-11-01T10:00:00Z" } : c,
    );
    renderWithTooltips(<CommentList comments={list} viewer="visitor" />);
    // Hidden with the other resolved ones, and back with them.
    expect(screen.queryByText("Comment deleted")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "2 resolved comments" }),
    );
    expect(screen.getByText("Comment deleted")).toBeInTheDocument();
  });

  it("is gone once it has no replies", () => {
    const list = withdraw("c2").filter((c) => c.parent_id !== "c2");
    renderWithTooltips(<CommentList comments={list} viewer="visitor" />);
    expect(screen.queryByText("Comment deleted")).toBeNull();
  });
});

describe("CommentList actions on your own comment", () => {
  it("offers Edit and Delete on your own, Report on others", async () => {
    const user = userEvent.setup();
    const own = threadedComments.find((c) => !c.parent_id)!;
    renderWithTooltips(
      <CommentList
        comments={threadedComments}
        viewer="visitor"
        viewerId={own.author_id}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const name = own.author.display_name;
    const menus = screen.getAllByRole("button", {
      name: `More actions for the comment by ${name}`,
    });
    await user.click(menus[0]!);
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Report comment" }),
    ).toBeNull();
  });
});
