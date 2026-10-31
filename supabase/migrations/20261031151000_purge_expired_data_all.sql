-- Two migrations replaced private.purge_expired_data independently: one
-- added the email queue rows, the other the play events, and the later one
-- dropped the email rows again. This version purges everything.

create or replace function private.purge_expired_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.track_upload_ips where created_at < now() - interval '30 days';
  delete from private.rate_limit_events where created_at < now() - interval '8 days';
  delete from private.play_events where created_at < now() - interval '2 days';
  delete from public.email_queue where sent_at < now() - interval '7 days';
  -- Nothing waits longer than three days.
  delete from public.email_queue where sent_at is null and created_at < now() - interval '3 days';
$$;
