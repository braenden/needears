/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { site } from "@/config/site";

import {
  isModerationAction,
  ModerationNotice,
  moderationLead,
} from "./moderation-notice";

const track = { slug: "night-bus", title: "Night bus" };

describe("moderation notices", () => {
  it("says what happened to whom", () => {
    expect(moderationLead("hidden", "comment")).toBe(
      "A moderator hid your comment on",
    );
    expect(moderationLead("removed", "track")).toBe(
      "A moderator removed your track",
    );
    expect(moderationLead("report_dismissed", "track")).toBe(
      "We looked at your report about the track",
    );
    expect(isModerationAction("report_upheld")).toBe(true);
    expect(isModerationAction("banned")).toBe(false);
  });

  it("shows the reason as text and how to appeal on your own post", () => {
    render(
      <ModerationNotice
        action="hidden"
        target="comment"
        reason="<b>Spam</b> links"
        track={track}
        at="?t=12"
        createdAt="2026-10-31T10:00:00Z"
      />,
    );
    expect(screen.getByText("<b>Spam</b> links")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Night bus" })).toHaveAttribute(
      "href",
      "/t/night-bus?t=12",
    );
    expect(
      screen.getByRole("link", { name: site.contactEmail }),
    ).toHaveAttribute("href", `mailto:${site.contactEmail}`);
  });

  it("does not offer an appeal to the person who reported", () => {
    render(
      <ModerationNotice
        action="report_dismissed"
        target="track"
        reason={null}
        track={track}
        at=""
        createdAt="2026-10-31T10:00:00Z"
      />,
    );
    expect(screen.getByText(/and left it up\./)).toBeInTheDocument();
    expect(screen.queryByText(/Think this is a mistake/)).toBeNull();
  });

  it("does not link a removed track", () => {
    render(
      <ModerationNotice
        action="removed"
        target="track"
        reason="Not your own work."
        track={track}
        at=""
        createdAt="2026-10-31T10:00:00Z"
      />,
    );
    expect(screen.queryByRole("link", { name: "Night bus" })).toBeNull();
    expect(screen.getByText("Night bus")).toBeInTheDocument();
  });
});
