import { describe, expect, it } from "vitest";

import { capTags } from "./details-fields";

describe("capTags", () => {
  it("lets up to five tags through", () => {
    expect(capTags("a, b, c, d, e")).toEqual({
      value: "a, b, c, d, e",
      capped: false,
    });
    expect(capTags("a, b,")).toEqual({ value: "a, b,", capped: false });
  });

  it("stops at the comma that would start a sixth", () => {
    expect(capTags("a, b, c, d, e,")).toEqual({
      value: "a, b, c, d, e",
      capped: true,
    });
  });

  it("keeps the first five of a paste", () => {
    expect(capTags("a,b,c,d,e,f,g")).toEqual({
      value: "a,b,c,d,e",
      capped: true,
    });
  });

  it("does not count empty ones", () => {
    expect(capTags("a,,b, ,c,d")).toEqual({
      value: "a,,b, ,c,d",
      capped: false,
    });
  });
});
