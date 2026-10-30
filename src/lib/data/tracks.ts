import "server-only";
import { FEED_MAX_PAGE, FEED_PAGE_SIZE } from "@/config/limits";
import { reactionCounts } from "./parse";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { Comment, Genre, Track, TrackSummary } from "@/types/view";
import { loadPeaks, signAudio } from "./media";

type UserClient = Awaited<ReturnType<typeof createClient>>;

export const FEED_TABS = ["needs-ears", "latest", "trending"] as const;
export type FeedTab = (typeof FEED_TABS)[number];

const FEED_FUNCTIONS = {
  "needs-ears": "feed_needs_ears",
  latest: "feed_latest",
  trending: "feed_trending",
} as const;

const OWNER =
  "owner:profiles!tracks_owner_id_fkey(id, handle, display_name, avatar_url, reputation)";
const SUMMARY_COLUMNS = `id, slug, title, duration_ms, comment_count, published_at, feedback_wants, reaction_counts, audio_key, peaks_key, genre:genres(slug, name), ${OWNER}`;
const TRACK_COLUMNS = `${SUMMARY_COLUMNS}, description, tags, level, status, owner_id`;

// Bars in the card waveform (MiniWaveform's default).
const CARD_BARS = 72;

export type CardTrack = TrackSummary & { audioUrl: string | null };

type SummaryRow = {
  id: string;
  slug: string;
  title: string;
  duration_ms: number;
  comment_count: number;
  published_at: string;
  feedback_wants: TrackSummary["feedback_wants"];
  reaction_counts: Json;
  audio_key: string;
  peaks_key: string;
  genre: Genre | null;
  owner: TrackSummary["owner"] | null;
};

// Rows to cards: one signing request and cached peaks for the whole list.
async function toCards(
  supabase: UserClient,
  rows: SummaryRow[],
): Promise<CardTrack[]> {
  const visible = rows.filter((row) => row.owner && row.genre);
  const [urls, peaks] = await Promise.all([
    signAudio(
      supabase,
      visible.map((row) => row.audio_key),
    ),
    loadPeaks(
      supabase,
      visible.map((row) => row.peaks_key),
      CARD_BARS,
    ),
  ]);
  return visible.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    duration_ms: row.duration_ms,
    comment_count: row.comment_count,
    published_at: row.published_at,
    feedback_wants: row.feedback_wants,
    reaction_counts: reactionCounts(row.reaction_counts),
    genre: row.genre!,
    owner: row.owner!,
    peaks: peaks.get(row.peaks_key) ?? [],
    audioUrl: urls.get(row.audio_key) ?? null,
  }));
}

export async function getFeed(
  tab: FeedTab,
  genre: string | null,
  page: number,
): Promise<{ tracks: CardTrack[]; hasMore: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc(FEED_FUNCTIONS[tab], {
      p_genre: genre ?? undefined,
      p_page: page,
      p_page_size: FEED_PAGE_SIZE,
    })
    .select(SUMMARY_COLUMNS);
  if (error) throw new Error(`Feed failed: ${error.code}`);
  const rows = data as unknown as SummaryRow[];
  return {
    tracks: await toCards(supabase, rows),
    hasMore: rows.length === FEED_PAGE_SIZE && page < FEED_MAX_PAGE,
  };
}

// Tracks on a profile. RLS shows the owner their hidden tracks too.
export async function getTracksByOwner(
  ownerId: string,
  limit = 50,
): Promise<CardTrack[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select(SUMMARY_COLUMNS)
    .eq("owner_id", ownerId)
    .in("status", ["live", "hidden"])
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Tracks failed: ${error.code}`);
  return toCards(supabase, data as unknown as SummaryRow[]);
}

export type TrackPageData = {
  track: Track;
  audioUrl: string | null;
  comments: Comment[];
};

const COMMENT_COLUMNS =
  "id, track_id, author_id, time_ms, category, body, is_helpful, status, created_at, author:profiles!comments_author_id_fkey(id, handle, display_name, avatar_url, reputation)";

// Everything the track page needs, read as the visitor, so RLS decides what
// they see. Null when the track does not exist or is not visible to them.
export async function getTrackPage(
  slug: string,
): Promise<TrackPageData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select(TRACK_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Track failed: ${error.code}`);
  if (!data) return null;
  const row = data as unknown as SummaryRow &
    Pick<Track, "description" | "tags" | "level" | "status" | "owner_id">;
  if (!row.owner || !row.genre || row.status === "deleted") return null;

  const [urls, peaks, comments] = await Promise.all([
    signAudio(supabase, [row.audio_key]),
    loadPeaks(supabase, [row.peaks_key]),
    supabase
      .from("comments")
      .select(COMMENT_COLUMNS)
      .eq("track_id", row.id)
      .is("parent_id", null)
      .order("created_at")
      .limit(500),
  ]);
  if (comments.error)
    throw new Error(`Comments failed: ${comments.error.code}`);

  return {
    track: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      duration_ms: row.duration_ms,
      comment_count: row.comment_count,
      published_at: row.published_at,
      feedback_wants: row.feedback_wants,
      reaction_counts: reactionCounts(row.reaction_counts),
      genre: row.genre,
      owner: row.owner,
      peaks: peaks.get(row.peaks_key) ?? [],
      description: row.description,
      tags: row.tags,
      level: row.level,
      status: row.status,
      owner_id: row.owner_id,
    },
    audioUrl: urls.get(row.audio_key) ?? null,
    comments: (comments.data as unknown as Comment[]).filter((c) => c.author),
  };
}
