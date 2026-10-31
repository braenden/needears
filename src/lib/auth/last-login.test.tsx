/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RememberLogin } from "@/components/common/remember-login";

import { readLastLogin, saveLastLogin } from "./last-login";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("last login", () => {
  it("remembers Google and email", () => {
    saveLastLogin("google");
    expect(readLastLogin()).toBe("google");
    saveLastLogin("email");
    expect(readLastLogin()).toBe("email");
    expect(localStorage.getItem("needears:last-login")).toBe("email");
  });

  it("is null when nothing or something else is stored", () => {
    expect(readLastLogin()).toBeNull();
    localStorage.setItem("needears:last-login", "facebook");
    expect(readLastLogin()).toBeNull();
  });

  it("stays quiet when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveLastLogin("google")).not.toThrow();
    expect(readLastLogin()).toBeNull();
  });

  it("saves email after a magic link and cleans the address", () => {
    window.history.replaceState(null, "", "/feed#signed-in=email");
    render(<RememberLogin />);
    expect(readLastLogin()).toBe("email");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/feed");
  });

  it("leaves other addresses alone", () => {
    window.history.replaceState(null, "", "/feed#comments");
    render(<RememberLogin />);
    expect(readLastLogin()).toBeNull();
    expect(window.location.hash).toBe("#comments");
  });
});
