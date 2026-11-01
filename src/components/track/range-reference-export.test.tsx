/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommentComposer } from "@/components/comments/comment-composer";
import { CommentList } from "@/components/comments/comment-list";
import { CommentMarkers } from "@/components/player/comment-markers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatSpan } from "@/lib/time";
import { rangeComments } from "@/mocks/ranges";

import { ExportMarkersMenu, markersHref } from "./export-markers-menu";
import { ReferenceLink, referenceError } from "./reference-link";

describe("formatSpan", () => {
  it("shows a point or a range", () => {
    expect(formatSpan(102_000)).toBe("1:42");
    expect(formatSpan(102_000, 118_000)).toBe("1:42 to 1:58");
    expect(formatSpan(102_000, 102_000)).toBe("1:42");
  });
});

describe("CommentComposer with a range", () => {
  it("sends the start and end, then clears the range", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => ({ ok: true as const }));
    const onClearRange = vi.fn();
    render(
      <CommentComposer
        currentTimeMs={0}
        durationMs={222_000}
        signedIn
        range={{ startMs: 102_000, endMs: 118_000 }}
        onClearRange={onClearRange}
        onSubmit={onSubmit}
      />,
    );
    const box = screen.getByPlaceholderText(
      "What do you hear from 1:42 to 1:58?",
    );
    await user.type(box, "This part drags");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ timeMs: 102_000, endMs: 118_000 }),
    );
    expect(onClearRange).toHaveBeenCalled();
  });

  it("lets the range be cleared, and sends no end without one", async () => {
    const user = userEvent.setup();
    const onClearRange = vi.fn();
    const { rerender } = render(
      <CommentComposer
        currentTimeMs={0}
        durationMs={222_000}
        signedIn
        range={{ startMs: 102_000, endMs: 118_000 }}
        onClearRange={onClearRange}
        onSubmit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Clear range" }));
    expect(onClearRange).toHaveBeenCalled();

    const onSubmit = vi.fn(async () => ({ ok: true as const }));
    rerender(
      <CommentComposer
        currentTimeMs={31_000}
        durationMs={222_000}
        signedIn
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "Comment" }), "Nice");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(onSubmit).toHaveBeenCalledWith({
      body: "Nice",
      category: "vibe",
      timeMs: 31_000,
    });
  });
});

describe("range comments in the list and markers", () => {
  it("shows the span on the time chip", () => {
    render(
      <TooltipProvider>
        <CommentList comments={rangeComments} viewer="visitor" />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Jump to 1:04 to 1:36" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Jump to 1:42" }),
    ).toBeInTheDocument();
  });

  it("names range markers with both times", () => {
    render(
      <CommentMarkers
        comments={rangeComments}
        durationMs={222_000}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /at 1:04 to 1:36/ }),
    ).toBeInTheDocument();
  });
});

describe("ReferenceLink", () => {
  it("links to allowed hosts only", () => {
    expect(referenceError("https://soundcloud.com/a/b")).toBeNull();
    expect(referenceError("")).toBeNull();
    expect(referenceError("http://soundcloud.com/a")).toBe(
      "Links start with https://.",
    );
    expect(referenceError("https://example.com/a")).toMatch(
      /^Reference tracks can link to/,
    );
    expect(
      referenceError("https://www.facebook.com/v19.0/dialog/oauth"),
    ).toMatch(/^Reference tracks can link to/);
  });

  it("opens the reference in a new tab and renders nothing for other hosts", () => {
    const { rerender, container } = render(
      <ReferenceLink url="https://www.youtube.com/watch?v=abc" />,
    );
    const link = screen.getByRole("link", {
      name: /Reference track on YouTube/,
    });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("nofollow");
    rerender(<ReferenceLink url="https://example.com/x" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ExportMarkersMenu", () => {
  it("is off with nothing to export", () => {
    render(<ExportMarkersMenu trackId="t1" timedCommentCount={0} />);
    expect(
      screen.getByRole("button", { name: "Export markers" }),
    ).toBeDisabled();
  });

  it("offers CSV, text and Reaper downloads from the markers route", async () => {
    const user = userEvent.setup();
    render(<ExportMarkersMenu trackId="t1" timedCommentCount={4} />);
    await user.click(screen.getByRole("button", { name: "Export markers" }));
    const csv = await screen.findByRole("menuitem", { name: /CSV/ });
    expect(csv).toHaveAttribute("href", markersHref("t1", "csv"));
    expect(csv).toHaveAttribute("download");
    expect(
      screen.getByRole("menuitem", { name: /Reaper markers/ }),
    ).toHaveAttribute("href", "/api/tracks/t1/markers?format=reaper");
  });
});
