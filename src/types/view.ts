// Thin view types for the UI, derived from the generated database types so
// they cannot drift from the schema. Rows keep their column names; the only
// additions are embedded relations and decoded peaks.
import type { Database, Tables } from "./database";

type Enums = Database["public"]["Enums"];

export type CommentCategory = Enums["feedback_category"];
// What an uploader wants feedback on uses the same five categories.
export type FeedbackWant = Enums["feedback_category"];
export type TrackLevel = Enums["track_level"];
export type ReactionKind = Enums["reaction_kind"];
export type ReportReason = Enums["report_reason"];
export type ReportTarget = Enums["report_target"];

export type ProfileSummary = Pick<
  Tables<"profiles">,
  "id" | "handle" | "display_name" | "avatar_url" | "reputation"
>;

export type Profile = ProfileSummary &
  Pick<Tables<"profiles">, "bio" | "created_at">;

export type ProfileStats = {
  tracks: number;
  commentsGiven: number;
  helpfulReceived: number;
};

export type ReactionCounts = Record<ReactionKind, number>;

export type Genre = Pick<Tables<"genres">, "slug" | "name">;

export type TrackSummary = Pick<
  Tables<"tracks">,
  | "id"
  | "slug"
  | "title"
  | "duration_ms"
  | "comment_count"
  | "listener_comment_count"
  | "needs_ears"
  | "play_count"
  | "published_at"
  | "feedback_wants"
> & {
  reaction_counts: ReactionCounts;
  genre: Genre;
  owner: ProfileSummary;
  // Peaks of the first channel, 0 to 1. The stored file is 8 bit.
  peaks: number[];
};

export type Track = TrackSummary &
  Pick<
    Tables<"tracks">,
    "description" | "tags" | "level" | "status" | "owner_id" | "reference_url"
  >;

export type Comment = Pick<
  Tables<"comments">,
  | "id"
  | "track_id"
  | "author_id"
  | "time_ms"
  | "category"
  | "body"
  | "is_helpful"
  | "status"
  | "created_at"
> & { author: ProfileSummary };

// A comment on a stretch of the track (comments.end_ms), 1:42 to 1:58.
export type RangeComment = Comment & { end_ms?: number | null };

// One uploaded version of a track (track_versions). Version 1 is the first
// upload; the track's own audio, peaks and duration mirror the latest one.
export type TrackVersion = {
  id: string;
  version_no: number;
  /** "What changed", written by the owner. */
  note: string | null;
  duration_ms: number;
  created_at: string;
};

// A comment that knows which version it was left on (comments.version_id).
export type VersionedComment = Comment & { version_id?: string | null };

// A comment that may be a reply (parent_id set) or resolved by the track
// owner. Optional so lists that do not load threads still type-check.
export type ThreadComment = Comment &
  Partial<
    Pick<
      Tables<"comments">,
      "parent_id" | "resolved_at" | "version_id" | "end_ms"
    >
  >;
