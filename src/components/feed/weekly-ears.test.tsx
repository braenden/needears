/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { weeklyLeaders, weekResetsAt } from "@/mocks/weekly";

import { resetText, WeeklyEars } from "./weekly-ears";

const resets = new Date(weekResetsAt).getTime();

describe("resetText", () => {
  it("counts down in days and hours, then hours, then minutes", () => {
    expect(resetText(weekResetsAt, resets - (2 * 24 + 5) * 3_600_000)).toBe(
      "Resets in 2 days, 5 hours",
    );
    expect(resetText(weekResetsAt, resets - 24 * 3_600_000)).toBe(
      "Resets in 1 day",
    );
    expect(resetText(weekResetsAt, resets - 3 * 3_600_000)).toBe(
      "Resets in 3 hours",
    );
    expect(resetText(weekResetsAt, resets - 90_000)).toBe("Resets in 1 minute");
    expect(resetText(weekResetsAt, resets + 1)).toBe("Resetting now");
  });

  it("says something sensible before the clock is known", () => {
    expect(resetText(weekResetsAt, null)).toBe("Resets every Monday");
  });
});

describe("WeeklyEars", () => {
  it("lists the top ten with profile links and Helpful counts", () => {
    render(
      <WeeklyEars
        leaders={[...weeklyLeaders, ...weeklyLeaders]}
        resetsAt={weekResetsAt}
      />,
    );
    const list = screen.getByRole("list", {
      name: "Most helpful ears this week",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(10);
    expect(within(items[0]!).getByRole("link")).toHaveAttribute(
      "href",
      "/u/miamixes",
    );
    expect(items[0]).toHaveTextContent("14 Helpful");
  });

  it("shows ties with the same rank", () => {
    render(
      <WeeklyEars
        variant="row"
        leaders={weeklyLeaders}
        resetsAt={weekResetsAt}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[3]).toHaveTextContent(/^4/);
    expect(items[4]).toHaveTextContent(/^4/);
  });

  it("invites people in when nobody has been marked Helpful yet", () => {
    render(<WeeklyEars leaders={[]} resetsAt={weekResetsAt} />);
    expect(
      screen.getByText(/Nobody has been marked Helpful yet this week/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
