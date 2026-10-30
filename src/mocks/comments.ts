import type { Comment } from "@/types/view";

import { jonas, longName, mia, newcomer, nora, sam } from "./profiles";
import { nightBus } from "./tracks";

const c = (
  id: string,
  p: Omit<
    Comment,
    "id" | "track_id" | "author_id" | "is_helpful" | "status"
  > & { is_helpful?: boolean },
): Comment => ({
  id,
  track_id: nightBus.id,
  author_id: p.author.id,
  is_helpful: false,
  status: "live",
  ...p,
});

/** Comments on Night Bus, owned by Jonas. */
export const comments: Comment[] = [
  c("c1", {
    author: mia,
    time_ms: 102_000,
    category: "mix",
    body: "The vocal chop drowns here. Try cutting 2 to 3 dB around 2 kHz on the snare bus so the chop can sit on top instead of fighting it.",
    is_helpful: true,
    created_at: "2026-10-28T22:01:00Z",
  }),
  c("c2", {
    author: nora,
    time_ms: 31_000,
    category: "vibe",
    body: "love this intro, it feels like actually sitting on a night bus",
    created_at: "2026-10-29T07:45:00Z",
  }),
  c("c3", {
    author: longName,
    time_ms: 64_500,
    category: "arrangement",
    body: "The build into the drop is eight bars too long for me. By the time the kick comes back I've stopped waiting for it. Maybe cut the second half of the riser, or put a short pause (half a bar of silence) right before the drop so it lands harder. Also, and this is more taste than anything, the hi-hat pattern in the build could change every four bars so the ear has something new to follow. Right now it stays the same for the whole sixteen bars and the energy flattens out even though the riser goes up.",
    is_helpful: true,
    created_at: "2026-10-29T10:20:00Z",
  }),
  c("c4", {
    author: sam,
    time_ms: 133_000,
    category: "sound_design",
    body: "That pad is gorgeous. What synth?",
    created_at: "2026-10-29T12:02:00Z",
  }),
  c("c5", {
    author: newcomer,
    time_ms: null,
    category: "vibe",
    body: "Saved this. Would play it on the way home.",
    created_at: "2026-10-29T16:44:00Z",
  }),
  c("c6", {
    author: mia,
    time_ms: 171_000,
    category: "mix",
    body: "Low end gets muddy when the second bassline comes in. Sidechain one of them to the other, or high-pass the top bass around 120 Hz.",
    created_at: "2026-10-30T09:10:00Z",
  }),
  c("c7", {
    author: jonas,
    time_ms: 205_000,
    category: "arrangement",
    body: "Note to self: the outro needs a real ending.",
    created_at: "2026-10-30T09:30:00Z",
  }),
];
