import type {
  CommentCategory,
  FeedbackWant,
  ReactionKind,
  ReportReason,
  TrackLevel,
} from "@/types/view";

// Labels for the database enums. Order of
// the keys is the order they are shown in.

export const CATEGORY_LABELS: Record<CommentCategory, string> = {
  vibe: "Vibe",
  mix: "Mix",
  arrangement: "Arrangement",
  vocals: "Vocals",
  sound_design: "Sound design",
};

// The same categories, worded for "what do you want feedback on".
export const FEEDBACK_WANT_LABELS: Record<FeedbackWant, string> = {
  mix: "Mix",
  arrangement: "Arrangement",
  vocals: "Vocals",
  sound_design: "Sound design",
  vibe: "Overall vibe",
};

export const LEVEL_LABELS: Record<TrackLevel, string> = {
  beginner: "I'm new to this",
  intermediate: "I've been at it a while",
  advanced: "I do this for work",
};

// The same levels, worded for other people reading the track page.
export const LEVEL_DISPLAY_LABELS: Record<TrackLevel, string> = {
  beginner: "New to this",
  intermediate: "Been at it a while",
  advanced: "Does this for work",
};

export const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] =
  [
    { kind: "fire", emoji: "🔥", label: "Fire" },
    { kind: "heart", emoji: "❤️", label: "Love" },
    { kind: "eyes", emoji: "👀", label: "Eyes on it" },
    { kind: "headphones", emoji: "🎧", label: "On repeat" },
  ];

// The microcopy lists "Not their own work" and "Copyright" separately and
// "Hate or harassment" as one; the database has `copyright` and `hate`
// apart. "Not their own work" is a copyright report, so it maps there.
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or ads",
  harassment: "Harassment",
  hate: "Hate",
  copyright: "Copyright, or not their own work",
  ai_generated: "AI-generated",
  other: "Other",
};
