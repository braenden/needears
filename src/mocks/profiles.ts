import type { Profile, ProfileStats } from "@/types/view";

const profile = (p: Partial<Profile> & Pick<Profile, "id" | "handle">) =>
  ({
    display_name: "",
    avatar_url: null,
    bio: "",
    reputation: 0,
    created_at: "2026-09-01T12:00:00Z",
    ...p,
  }) satisfies Profile;

/** The three personas, plus a few more voices. */
export const nora = profile({
  id: "u-nora",
  handle: "nora_makes",
  display_name: "Nora",
  bio: "Three tracks in, all made in FL Studio at night.",
  reputation: 1,
  created_at: "2026-10-21T18:30:00Z",
});

export const jonas = profile({
  id: "u-jonas",
  handle: "jonas_abl",
  display_name: "Jonas Lie",
  bio: "Ableton since 2023. Mostly deep house, sometimes broken beat. I have heard my own bassline 400 times.",
  reputation: 18,
  created_at: "2026-09-04T09:12:00Z",
});

export const mia = profile({
  id: "u-mia",
  handle: "miamixes",
  display_name: "Mia",
  bio: "I mix for friends and listen to everything unfinished.",
  reputation: 74,
  created_at: "2026-08-15T20:00:00Z",
});

export const sam = profile({
  id: "u-sam",
  handle: "sam_in_logic",
  display_name: "Sam",
  reputation: 4,
});

export const newcomer = profile({
  id: "u-new",
  handle: "first_timer_99",
});

export const longName = profile({
  id: "u-long",
  handle: "the_extremely_long_handle",
  display_name: "Bartholomew Featherstonehaugh-Montgomery the Third",
  bio: "Producer, sound designer, part-time modular synth hoarder and full-time overthinker of snare samples. I write long bios because nobody told me not to, and this one keeps going to test how the profile header wraps text on a small screen.",
  reputation: 16,
});

export const statsFor: Record<string, ProfileStats> = {
  [nora.id]: { tracks: 3, commentsGiven: 5, helpfulReceived: 1 },
  [jonas.id]: { tracks: 11, commentsGiven: 64, helpfulReceived: 18 },
  [mia.id]: { tracks: 1, commentsGiven: 212, helpfulReceived: 74 },
  [newcomer.id]: { tracks: 0, commentsGiven: 0, helpfulReceived: 0 },
  [longName.id]: { tracks: 0, commentsGiven: 12, helpfulReceived: 16 },
};

/** The newer profile fields, keyed by profile id. */
export const profileExtras: Record<
  string,
  {
    workingOn: string;
    daw: string;
    links: { label: string; url: string }[];
    stats: {
      commentsGiven: number;
      helpfulReceived: number;
      helpfulShare: number;
      weekStreak: number;
    };
    badges: {
      badge: "first_ears" | "finisher" | "ten_tracks_helped" | "golden_ear";
      awarded_at: string;
    }[];
  }
> = {
  [mia.id]: {
    workingOn:
      "Mixing a friend's debut EP, and learning to leave space in the low end.",
    daw: "Bitwig Studio",
    links: [
      { label: "", url: "https://soundcloud.com/miamixes" },
      { label: "Mixes for hire", url: "https://miamixes.bandcamp.com" },
      { label: "", url: "https://www.instagram.com/miamixes" },
    ],
    stats: {
      commentsGiven: 212,
      helpfulReceived: 74,
      helpfulShare: 0.35,
      weekStreak: 9,
    },
    badges: [
      { badge: "first_ears", awarded_at: "2026-08-16T10:00:00Z" },
      { badge: "ten_tracks_helped", awarded_at: "2026-09-02T10:00:00Z" },
      { badge: "golden_ear", awarded_at: "2026-10-11T10:00:00Z" },
    ],
  },
  [jonas.id]: {
    workingOn: "Night Bus, demo 5. Still fighting the drop.",
    daw: "Ableton Live",
    links: [
      { label: "", url: "https://soundcloud.com/jonas-abl" },
      { label: "Studio diary", url: "https://www.youtube.com/@jonasabl" },
    ],
    stats: {
      commentsGiven: 64,
      helpfulReceived: 18,
      helpfulShare: 0.28,
      weekStreak: 4,
    },
    badges: [
      { badge: "first_ears", awarded_at: "2026-09-10T10:00:00Z" },
      { badge: "finisher", awarded_at: "2026-10-30T18:00:00Z" },
    ],
  },
  [newcomer.id]: {
    workingOn: "",
    daw: "",
    links: [],
    stats: {
      commentsGiven: 0,
      helpfulReceived: 0,
      helpfulShare: 0,
      weekStreak: 0,
    },
    badges: [],
  },
};
