import type { VersionPipeline } from "@/components/versions/new-version-dialog";
import type { TrackVersion, VersionedComment } from "@/types/view";

import { comments } from "./comments";
import { mockPeaks } from "./peaks";
import { createMockPipeline } from "./upload-pipeline";

/** Night Bus in three versions. v3 is the one the track shows by default. */
export const nightBusVersions: (TrackVersion & { peaks: number[] })[] = [
  {
    id: "v1",
    version_no: 1,
    note: null,
    duration_ms: 222_000,
    created_at: "2026-10-28T21:14:00Z",
    peaks: mockPeaks(7),
  },
  {
    id: "v2",
    version_no: 2,
    note: "Pulled the vocal chop down 2 dB and cut 2 kHz on the snare bus.",
    duration_ms: 222_000,
    created_at: "2026-10-29T20:02:00Z",
    peaks: mockPeaks(8),
  },
  {
    id: "v3",
    version_no: 3,
    note: "Shortened the build into the drop by eight bars and gave the outro a real ending.",
    duration_ms: 206_000,
    created_at: "2026-10-30T17:50:00Z",
    peaks: mockPeaks(9),
  },
];

const versionOf: Record<string, string> = {
  c1: "v1",
  c2: "v1",
  c3: "v1",
  c4: "v2",
  c5: "v2",
  c6: "v3",
  c7: "v3",
};

export const versionedComments: VersionedComment[] = comments.map((c) => ({
  ...c,
  version_id: versionOf[c.id] ?? "v3",
}));

/**
 * The upload mock for analysis and encoding, plus a fake version publish
 * that counts up from the number of versions the track starts with.
 */
export function createMockVersionPipeline(startCount: number): VersionPipeline {
  const base = createMockPipeline({ speed: 2 });
  let count = startCount;
  return {
    analyze: base.analyze,
    encode: base.encode,
    async publish(input, onProgress) {
      for (let i = 1; i <= 8; i++) {
        await new Promise((r) => setTimeout(r, 120));
        onProgress(i / 8);
      }
      count += 1;
      const no = count;
      return {
        ok: true,
        version: {
          id: `v${no}`,
          version_no: no,
          note: input.note || null,
          duration_ms: input.durationMs,
          created_at: new Date().toISOString(),
        },
      };
    },
  };
}
