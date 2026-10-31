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
    "description" | "tags" | "level" | "status" | "owner_id"
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
