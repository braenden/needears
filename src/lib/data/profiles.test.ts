import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));

const { currentHandleFor } = await import("./profiles");

describe("currentHandleFor", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("returns the current handle for an old one", async () => {
    rpc.mockResolvedValue({ data: "nora_new", error: null });
    expect(await currentHandleFor("nora")).toBe("nora_new");
    expect(rpc).toHaveBeenCalledWith("resolve_old_handle", {
      p_handle: "nora",
    });
  });

  it("does not ask for something that cannot be a handle", async () => {
    expect(await currentHandleFor("../admin")).toBeNull();
    expect(await currentHandleFor("ab")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null when nobody had it, on errors and for the same handle", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await currentHandleFor("nobody")).toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "57014" } });
    expect(await currentHandleFor("nobody")).toBeNull();
    rpc.mockResolvedValueOnce({ data: "nora", error: null });
    expect(await currentHandleFor("nora")).toBeNull();
  });
});
