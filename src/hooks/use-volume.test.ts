/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

// A fresh module each time, so nothing read before leaks in.
const load = () => import("./use-volume");

describe("listening volume", () => {
  it("is full volume until set, then remembered", async () => {
    const { setListenVolume, useListenVolume } = await load();
    const { result } = renderHook(() => useListenVolume());
    expect(result.current).toBe(1);
    act(() => setListenVolume(0.4));
    expect(result.current).toBe(0.4);
    expect(localStorage.getItem("needears:volume")).toBe("0.4");
  });

  it("reads what was saved and keeps it between 0 and 1", async () => {
    localStorage.setItem("needears:volume", "0.25");
    const { setListenVolume, useListenVolume } = await load();
    const { result } = renderHook(() => useListenVolume());
    expect(result.current).toBe(0.25);
    act(() => setListenVolume(3));
    expect(result.current).toBe(1);
  });

  it("works without storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { setListenVolume, useListenVolume } = await load();
    const { result } = renderHook(() => useListenVolume());
    expect(result.current).toBe(1);
    act(() => setListenVolume(0.5));
    expect(result.current).toBe(0.5);
    vi.restoreAllMocks();
  });
});
