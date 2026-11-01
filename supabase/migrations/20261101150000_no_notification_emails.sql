-- No more emails about comments, replies and Helpful marks.
--
-- They stay as notifications on the site. Sign in links and the digest
-- shared the email provider's daily quota, and sign in links need the room.
-- Security emails (a way to sign in added or removed, the email address
-- changed) are queued and sent exactly as before.
--
-- Notifications are no longer queued, notification rows that have not gone
-- out are deleted so nothing old is sent later, and the digest batch is
-- gone. profiles.email_notifications stays for now; it no longer does
-- anything.

drop trigger notifications_queue_email on public.notifications;
drop function private.notifications_queue_email();

delete from public.email_queue
where notification_id is not null and sent_at is null;

drop function public.email_batch(integer, integer);
