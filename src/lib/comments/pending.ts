// What someone was about to post when they had to pick a username first.
// Kept in this tab only (sessionStorage) and handed back once, when they
// come back to the track. Storage can be off (private windows); then the
// draft is simply gone, as if the tab had been closed.

import type { CommentCategory } from "@/types/view";

export type PendingPost =
  | {
      kind: "comment";
      body: string;
      category: CommentCategory;
      timeMs: number | null;
      endMs?: number | null;
    }
  | { kind: "reply"; parentId: string; body: string };

const key = (trackId: string) => `needears:pending:${trackId}`;

export function keepPending(trackId: string, post: PendingPost): void {
  try {
    sessionStorage.setItem(key(trackId), JSON.stringify(post));
  } catch {
    // Not kept.
  }
}

/** The kept post for this track, once: reading it forgets it. */
export function takePending(trackId: string): PendingPost | null {
  try {
    const raw = sessionStorage.getItem(key(trackId));
    sessionStorage.removeItem(key(trackId));
    if (!raw) return null;
    const post = JSON.parse(raw) as PendingPost;
    if (post.kind === "comment" && typeof post.body === "string") return post;
    if (
      post.kind === "reply" &&
      typeof post.body === "string" &&
      typeof post.parentId === "string"
    )
      return post;
    return null;
  } catch {
    return null;
  }
}
