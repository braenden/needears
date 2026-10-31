import type { Track } from "@/types/view";

import { mockPeaks } from "./peaks";
import { jonas, longName, mia, nora, sam } from "./profiles";

export const nightBus: Track = {
  id: "t-night-bus",
  slug: "k3x9-night-bus",
  title: "Night Bus (demo 4)",
  description:
    "Late night deep house sketch. Not sure the drop hits hard enough, and the vocal chop might be too loud.",
  genre: { slug: "house", name: "House" },
  tags: ["deep house", "vocal chop"],
  feedback_wants: ["mix", "arrangement"],
  level: "intermediate",
  duration_ms: 222_000,
  peaks: mockPeaks(7),
  comment_count: 7,
  play_count: 214,
  reaction_counts: { fire: 12, heart: 4, eyes: 2, headphones: 7 },
  published_at: "2026-10-28T21:14:00Z",
  owner: jonas,
  owner_id: jonas.id,
  status: "live",
  reference_url: null,
};

export const firstTrack: Track = {
  id: "t-first",
  slug: "p2m1-my-first-track",
  title: "my first track",
  description: "",
  genre: { slug: "lo-fi", name: "Lo-fi" },
  tags: [],
  feedback_wants: ["vibe"],
  level: "beginner",
  duration_ms: 134_000,
  peaks: mockPeaks(21),
  comment_count: 0,
  play_count: 0,
  reaction_counts: { fire: 0, heart: 1, eyes: 0, headphones: 0 },
  published_at: "2026-10-30T08:02:00Z",
  owner: nora,
  owner_id: nora.id,
  status: "live",
  reference_url: null,
};

export const longTitle: Track = {
  id: "t-long",
  slug: "z8q4-long-title",
  title:
    "Untitled Ambient Thing That Started As A Field Recording From The Ferry And Became Something Else Entirely (v12 final final)",
  description: "",
  genre: { slug: "ambient", name: "Ambient" },
  tags: ["field recording", "drone", "ferry", "granular"],
  feedback_wants: ["sound_design", "mix", "arrangement", "vocals", "vibe"],
  level: "advanced",
  duration_ms: 731_000,
  peaks: mockPeaks(3),
  comment_count: 1,
  play_count: 9,
  reaction_counts: { fire: 0, heart: 0, eyes: 3, headphones: 1 },
  published_at: "2026-10-12T15:40:00Z",
  owner: longName,
  owner_id: longName.id,
  status: "live",
  reference_url: null,
};

const brokenBeat: Track = {
  id: "t-broken",
  slug: "a1b2-wonky",
  title: "Wonky 140",
  description: "Broken beat at 140. Is the swing too much?",
  genre: { slug: "broken-beat", name: "Broken beat" },
  tags: ["swing"],
  feedback_wants: ["arrangement", "vibe"],
  level: "intermediate",
  duration_ms: 187_000,
  peaks: mockPeaks(42),
  comment_count: 23,
  play_count: 1380,
  reaction_counts: { fire: 31, heart: 9, eyes: 5, headphones: 14 },
  published_at: "2026-10-25T11:00:00Z",
  owner: sam,
  owner_id: sam.id,
  status: "live",
  reference_url: null,
};

export const vocalDemo: Track = {
  id: "t-vocal",
  slug: "m9n8-hold-on",
  title: "Hold On",
  description: "First time recording my own vocals.",
  genre: { slug: "pop", name: "Pop" },
  tags: ["vocals"],
  feedback_wants: ["vocals", "mix"],
  level: "beginner",
  duration_ms: 201_000,
  peaks: mockPeaks(99),
  comment_count: 1,
  play_count: 12,
  reaction_counts: { fire: 2, heart: 6, eyes: 0, headphones: 1 },
  published_at: "2026-10-29T19:30:00Z",
  owner: mia,
  owner_id: mia.id,
  status: "live",
  reference_url: null,
};

export const tracks = [nightBus, firstTrack, brokenBeat, vocalDemo, longTitle];
