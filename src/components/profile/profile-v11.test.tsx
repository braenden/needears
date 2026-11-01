/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { clampCrop, coverScale, sourceRect } from "./avatar-upload";
import { BadgeList } from "./badges";
import { hostOf, linkError } from "./link-hosts";
import { ProfileEditor } from "./profile-editor";
import { ProfileLinks } from "./profile-links";
import { ProfileStatsBlock } from "./profile-stats";

describe("profile links", () => {
  it("knows the allowed hosts, subdomains included", () => {
    expect(hostOf("https://soundcloud.com/mia")).toBe("soundcloud.com");
    expect(hostOf("https://mia.bandcamp.com")).toBe("bandcamp.com");
    expect(hostOf("https://www.instagram.com/mia")).toBe("instagram.com");
    expect(hostOf("https://evil-soundcloud.com/mia")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });

  it("explains what is wrong with a link", () => {
    expect(
      linkError({ label: "", url: "https://soundcloud.com/mia" }),
    ).toBeNull();
    expect(linkError({ label: "", url: "" })).toBe("Add a link.");
    expect(linkError({ label: "", url: "http://soundcloud.com/mia" })).toBe(
      "Links start with https://.",
    );
    expect(linkError({ label: "", url: "https://example.com" })).toMatch(
      /^Links can go to SoundCloud/,
    );
  });

  it("names the service, whatever label was stored", () => {
    render(
      <ProfileLinks
        links={[
          {
            label: "https://on.soundcloud.com/abc",
            url: "https://tiktok.com/@someone",
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /TikTok/ });
    expect(link).toHaveAttribute("href", "https://tiktok.com/@someone");
    expect(screen.queryByText(/soundcloud/i)).toBeNull();
  });

  it("opens links in a new tab without passing the referrer", () => {
    render(
      <ProfileLinks
        links={[{ label: "", url: "https://soundcloud.com/mia" }]}
      />,
    );
    const link = screen.getByRole("link", { name: /SoundCloud/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("ugc");
  });
});

describe("avatar crop", () => {
  it("starts by covering the square with the short side", () => {
    expect(coverScale(1200, 800, 256)).toBeCloseTo(0.32);
  });

  it("never leaves an empty edge", () => {
    const crop = clampCrop({ x: 50, y: -999, zoom: 5 }, 1200, 800, 256);
    expect(crop.zoom).toBe(3);
    expect(crop.x).toBe(0);
    const scale = coverScale(1200, 800, 256) * 3;
    expect(crop.y).toBeCloseTo(256 - 800 * scale);
  });

  it("maps the square back to image pixels", () => {
    const rect = sourceRect({ x: -64, y: 0, zoom: 1 }, 1200, 800, 256);
    expect(rect.size).toBeCloseTo(800);
    expect(rect.sx).toBeCloseTo(200);
    expect(rect.sy).toBeCloseTo(0);
  });
});

describe("ProfileEditor", () => {
  const initial = {
    displayName: "Mia",
    handle: "mia",
    bio: "",
    workingOn: "",
    daw: "",
    links: [],
  };

  it("refuses links to hosts that are not allowed, next to the field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => ({ ok: true as const }));
    render(<ProfileEditor initial={initial} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    await user.type(
      screen.getByRole("textbox", { name: "Link 1 address" }),
      "https://example.com/me",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/^Links can go to SoundCloud/)).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Link 1 address" }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves trimmed values and drops empty link rows", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => ({ ok: true as const }));
    render(<ProfileEditor initial={initial} onSave={onSave} />);
    await user.type(
      screen.getByRole("textbox", { name: /Working on/ }),
      "  An EP  ",
    );
    await user.type(screen.getByRole("combobox", { name: /DAW/ }), "Reaper");
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    await user.type(
      screen.getByRole("textbox", { name: "Link 1 address" }),
      "https://soundcloud.com/me",
    );
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      displayName: "Mia",
      handle: "mia",
      bio: "",
      workingOn: "An EP",
      daw: "Reaper",
      links: [{ label: "", url: "https://soundcloud.com/me" }],
    });
  });

  it("stops offering more links at five", async () => {
    const user = userEvent.setup();
    render(<ProfileEditor initial={initial} onSave={vi.fn()} />);
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole("button", { name: "Add a link" }));
    }
    expect(
      screen.queryByRole("button", { name: "Add a link" }),
    ).not.toBeInTheDocument();
  });
});

describe("BadgeList and ProfileStatsBlock", () => {
  it("shows only earned badges to others, and the rest as locked on your own profile", () => {
    const earned = [
      { badge: "first_ears" as const, awarded_at: "2026-09-10T10:00:00Z" },
    ];
    const { rerender } = render(
      <TooltipProvider>
        <BadgeList badges={earned} />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    rerender(
      <TooltipProvider>
        <BadgeList badges={earned} showLocked />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getAllByText("(not earned yet)")).toHaveLength(3);
  });

  it("shows the Helpful share as a percentage and handles a new account", () => {
    const { rerender } = render(
      <ProfileStatsBlock
        stats={{
          commentsGiven: 20,
          helpfulReceived: 7,
          helpfulShare: 0.35,
          weekStreak: 1,
        }}
      />,
    );
    expect(screen.getByText("35%")).toBeInTheDocument();
    expect(screen.getByText("1 week")).toBeInTheDocument();
    rerender(
      <ProfileStatsBlock
        stats={{
          commentsGiven: 0,
          helpfulReceived: 0,
          helpfulShare: 0,
          weekStreak: 0,
        }}
      />,
    );
    expect(screen.getAllByText("None yet")).toHaveLength(2);
  });
});
