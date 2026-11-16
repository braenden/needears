type Listed = { id: string; comment_count: number };

/**
 * What the home page shows: one track to play beside the intro, and a few
 * rows under it. Trending comes first. Trending only holds tracks someone
 * has commented on or reacted to in the last week, so on a quiet week it is
 * short or empty: the newest tracks fill in, and the rows say which they are.
 */
export function homeTracks<T extends Listed>(
  trending: T[],
  latest: T[],
  rowCount: number,
): { pick: T | null; rows: T[]; newest: boolean } {
  const commented = (list: T[]) => list.find((t) => t.comment_count > 0);
  const pick =
    commented(trending) ??
    trending[0] ??
    commented(latest) ??
    latest[0] ??
    null;
  const rest = (list: T[]) =>
    list.filter((t) => t.id !== pick?.id).slice(0, rowCount);
  const rows = rest(trending);
  return rows.length > 0
    ? { pick, rows, newest: false }
    : { pick, rows: rest(latest), newest: true };
}
