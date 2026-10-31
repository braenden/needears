// Notification kinds the notifications page lists. The unread count and
// "mark as read" use the same list, so nothing is counted or marked read
// that the page does not show. Moderation notices are not listed yet.
export const LISTED_NOTIFICATION_KINDS = [
  "comment",
  "reply",
  "helpful",
] as const;

export type ListedNotificationKind = (typeof LISTED_NOTIFICATION_KINDS)[number];
