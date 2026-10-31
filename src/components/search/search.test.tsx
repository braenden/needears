/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { searchMock } from "@/mocks/search";

import { SearchField } from "./search-field";
import { highlightParts, SearchResults } from "./search-results";

describe("highlightParts", () => {
  it("marks every case-insensitive match", () => {
    expect(highlightParts("miamixes", "MI")).toEqual([
      { text: "mi", match: true },
      { text: "a", match: false },
      { text: "mi", match: true },
      { text: "xes", match: false },
    ]);
    expect(highlightParts("Night Bus", "")).toEqual([
      { text: "Night Bus", match: false },
    ]);
  });
});

describe("SearchField", () => {
  it("is a GET search form for q", () => {
    render(<SearchField />);
    const form = screen.getByRole("search", { name: "Search" });
    expect(form).toHaveAttribute("action", "/search");
    expect(form).toHaveAttribute("method", "get");
    expect(
      screen.getByRole("searchbox", { name: "Search tracks and people" }),
    ).toHaveAttribute("name", "q");
  });

  it("jumps to the box on / but not while typing elsewhere", () => {
    render(
      <>
        <textarea aria-label="Other" />
        <SearchField />
      </>,
    );
    const box = screen.getByRole("searchbox");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(box).toHaveFocus();

    const other = screen.getByRole("textbox", { name: "Other" });
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(other).toHaveFocus();
  });

  it("does not listen for / when the shortcut is off", () => {
    render(<SearchField shortcut={false} />);
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("searchbox")).not.toHaveFocus();
  });
});

describe("SearchResults", () => {
  it("shows tracks and people in two groups with links", () => {
    const { tracks, profiles } = searchMock("mia");
    render(<SearchResults query="mia" tracks={tracks} profiles={profiles} />);
    expect(screen.getByRole("heading", { name: /People/ })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Mia/ });
    expect(link).toHaveAttribute("href", "/u/miamixes");
    expect(
      within(link).getAllByText(/mia/i, { selector: "mark" }).length,
    ).toBeGreaterThan(0);
  });

  it("asks for at least as many characters as the database searches", () => {
    render(<SearchResults query=" mi " tracks={[]} profiles={[]} />);
    expect(screen.getByText(/Type at least 3 characters/)).toBeInTheDocument();
  });

  it("says when nothing was found", () => {
    render(<SearchResults query="night bsu" tracks={[]} profiles={[]} />);
    expect(
      screen.getByText('Nothing found for "night bsu".'),
    ).toBeInTheDocument();
  });
});
