-- New notification kind for moderation notices. On its own, because a new
-- enum value cannot be used in the transaction that adds it.

alter type public.notification_kind add value if not exists 'moderation';
