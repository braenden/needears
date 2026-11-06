import { describe, expect, it } from "vitest";

import { capTags, nextTags, tagCount } from "./details-fields";

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

describe("nextTags", () => {
  const type = (text: string) => {
    let state = { value: "", stopped: null as string | null };
    for (let i = 1; i <= text.length; i++)
      state = nextTags(state, state.value + text[i - 1]);
    return state.value;
  };

  it("does not let words after a refused comma join the fifth tag", () => {
    expect(type("one, two, three, four, five, six, seven")).toBe(
      "one, two, three, four, five",
    );
  });

  it("moves again once something is deleted", () => {
    const stopped = nextTags(
      { value: "", stopped: null },
      "one, two, three, four, five,",
    );
    expect(stopped.value).toBe("one, two, three, four, five");
    const shorter = nextTags(stopped, "one, two, three, four, fiv");
    expect(shorter).toEqual({
      value: "one, two, three, four, fiv",
      stopped: null,
    });
    expect(nextTags(shorter, "one, two, three, four, five").value).toBe(
      "one, two, three, four, five",
    );
  });
});

describe("tagCount", () => {
  it("counts the tags written", () => {
    expect(tagCount("a, b,, c, ")).toBe(3);
  });
});
