import { formatTime } from "@/lib/time";

export const MARKER_FORMATS = ["csv", "txt", "reaper"] as const;
export type MarkerFormat = (typeof MARKER_FORMATS)[number];

export type Marker = {
  timeMs: number;
  endMs: number | null;
  author: string;
  category: string;
  text: string;
};

// Comment text on one line, without control or direction characters, and
// short enough for a DAW marker name.
function clean(value: string, max = 200): string {
  const plain = value
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

// A CSV field. Text that starts like a formula gets a leading apostrophe,
// and so does anything after a separator inside the text, since a
// spreadsheet with a different list separator (; in many locales) may split
// the field there and run what follows.
function csvField(value: string): string {
  const safe = value
    .replace(/^(\s*)([=+\-@])/, "$1'$2")
    .replace(/([;,|])(\s*)([=+\-@])/g, "$1$2'$3");
  return `"${safe.replaceAll('"', '""')}"`;
}

// Seconds with milliseconds: 102.500
function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

export function renderMarkers(markers: Marker[], format: MarkerFormat): string {
  const rows = markers.map((m) => ({
    ...m,
    author: clean(m.author, 50),
    text: clean(m.text),
  }));

  switch (format) {
    case "csv":
      return (
        [
          "start_seconds,end_seconds,start,author,category,comment",
          ...rows.map((m) =>
            [
              seconds(m.timeMs),
              m.endMs != null ? seconds(m.endMs) : "",
              formatTime(m.timeMs),
              csvField(m.author),
              m.category,
              csvField(m.text),
            ].join(","),
          ),
        ].join("\r\n") + "\r\n"
      );
    case "txt":
      return (
        rows
          .map((m) => {
            const at =
              m.endMs != null
                ? `${formatTime(m.timeMs)} to ${formatTime(m.endMs)}`
                : formatTime(m.timeMs);
            return `${at}  ${m.author}: ${m.text}`;
          })
          .join("\n") + "\n"
      );
    case "reaper":
      // Reaper's region and marker list (import with "Import markers and
      // regions"): points become markers, ranges become regions. Times are
      // in seconds, which Reaper reads whatever ruler format is set.
      return (
        [
          "#,Name,Start,End,Length",
          ...rows.map((m, i) =>
            m.endMs != null
              ? [
                  `R${i + 1}`,
                  csvField(`${m.author}: ${m.text}`),
                  seconds(m.timeMs),
                  seconds(m.endMs),
                  seconds(m.endMs - m.timeMs),
                ].join(",")
              : [
                  `M${i + 1}`,
                  csvField(`${m.author}: ${m.text}`),
                  seconds(m.timeMs),
                  "",
                  "",
                ].join(","),
          ),
        ].join("\r\n") + "\r\n"
      );
  }
}
