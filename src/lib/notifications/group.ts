const DAY_MS = 24 * 60 * 60 * 1000;

type Groupable = {
  kind: string;
  created_at: string;
  read_at: string | null;
  actor: { id: string } | null;
  track: { slug: string } | null;
};

export type NotificationGroup<T extends Groupable> = {
  /** Newest first, like the list. */
  items: T[];
  /** The people in it, each once, newest first. */
  actors: NonNullable<T["actor"]>[];
};

/**
 * Notifications of the same kind on the same track within a day of the
 * newest one share a row ("Jonas and 3 others commented on Night bus").
 * Moderation notices always stand alone. Expects newest first.
 */
export function groupNotifications<T extends Groupable>(
  rows: T[],
): NotificationGroup<T>[] {
  const groups: NotificationGroup<T>[] = [];
  const open = new Map<string, NotificationGroup<T>>();
  for (const row of rows) {
    const key =
      row.kind === "moderation" || !row.track
        ? null
        : `${row.kind}:${row.track.slug}`;
    const group = key ? open.get(key) : undefined;
    const newest = group?.items[0];
    if (
      group &&
      newest &&
      Date.parse(newest.created_at) - Date.parse(row.created_at) < DAY_MS
    ) {
      group.items.push(row);
      if (row.actor && !group.actors.some((a) => a.id === row.actor!.id))
        group.actors.push(row.actor);
      continue;
    }
    const fresh: NotificationGroup<T> = {
      items: [row],
      actors: row.actor ? [row.actor as NonNullable<T["actor"]>] : [],
    };
    groups.push(fresh);
    if (key) open.set(key, fresh);
  }
  return groups;
}

/** "Jonas", "Jonas and Mia", "Jonas and 3 others". */
export function namesText(names: string[]) {
  if (names.length <= 1) return names[0] ?? "Someone";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}
