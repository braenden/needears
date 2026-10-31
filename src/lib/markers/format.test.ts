import { describe, expect, it } from "vitest";
import { renderMarkers, type Marker } from "./format";

const markers: Marker[] = [
  {
    timeMs: 5000,
    endMs: null,
    author: "Mia",
    category: "mix",
    text: 'Kick is "weak"',
  },
  {
    timeMs: 102500,
    endMs: 118000,
    author: "Jonas",
    category: "arrangement",
    text: "This part\ndrags",
  },
];

describe("renderMarkers", () => {
  it("writes CSV with quoted text and both time forms", () => {
    const csv = renderMarkers(markers, "csv");
    expect(csv.split("\r\n")[0]).toBe(
      "start_seconds,end_seconds,start,author,category,comment",
    );
    expect(csv).toContain('5.000,,0:05,"Mia",mix,"Kick is ""weak"""');
    expect(csv).toContain(
      '102.500,118.000,1:42,"Jonas",arrangement,"This part drags"',
    );
  });

  it("writes plain text with ranges", () => {
    expect(renderMarkers(markers, "txt")).toBe(
      '0:05  Mia: Kick is "weak"\n1:42 to 1:58  Jonas: This part drags\n',
    );
  });

  it("writes Reaper markers and regions", () => {
    const lines = renderMarkers(markers, "reaper").trim().split("\r\n");
    expect(lines[0]).toBe("#,Name,Start,End,Length");
    expect(lines[1]).toBe('M1,"Mia: Kick is ""weak""",5.000,,');
    expect(lines[2]).toBe('R2,"Jonas: This part drags",102.500,118.000,15.500');
  });

  it("defuses spreadsheet formulas and strips control characters", () => {
    const csv = renderMarkers(
      [
        {
          timeMs: 0,
          endMs: null,
          author: "=cmd|' /c calc'!A0",
          category: "vibe",
          text: "@SUM(1)\u202e",
        },
      ],
      "csv",
    );
    expect(csv).toContain(`"'=cmd|' /c calc'!A0"`);
    expect(csv).toContain(`"'@SUM(1)"`);
    expect(csv).not.toContain("\u202e");
  });

  it("defuses formulas after a separator inside the text", () => {
    const csv = renderMarkers(
      [
        {
          timeMs: 0,
          endMs: null,
          author: "x",
          category: "vibe",
          text: "fine mix;=cmd|' /c calc'!A0; -2+3",
        },
      ],
      "csv",
    );
    expect(csv).toContain(`"fine mix;'=cmd|' /c calc'!A0; '-2+3"`);
  });
});
