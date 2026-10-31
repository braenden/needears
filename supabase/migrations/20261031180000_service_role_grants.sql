-- Hosted projects created after October 2026 give the API roles no
-- privileges on new tables, sequences or functions by default, while the
-- local stack still grants everything. The migrations grant anon and
-- authenticated what they need explicitly, but relied on the default for
-- the service role, so every route handler that uses it (uploads, profile
-- pictures, moderation, cron) failed in production with "permission denied".
-- Grant it now and for future objects, so both environments behave the same.
-- The service role bypasses row level security by design.

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

grant execute on function public.admin_resolve_report(uuid, public.report_status, text) to service_role;
grant execute on function public.admin_set_banned(uuid, boolean) to service_role;
grant execute on function public.admin_set_comment_status(uuid, public.comment_status, text) to service_role;
grant execute on function public.admin_set_track_status(uuid, public.track_status, text) to service_role;
grant execute on function public.admin_stats() to service_role;
grant execute on function public.can_upload_avatar(text) to service_role;
grant execute on function public.can_upload_object(text, text) to service_role;
grant execute on function public.feed_latest(text, integer, integer) to service_role;
grant execute on function public.feed_needs_ears(text, integer, integer) to service_role;
grant execute on function public.feed_trending(text, integer, integer) to service_role;
grant execute on function public.is_admin() to service_role;
grant execute on function public.profile_stats(uuid) to service_role;
grant execute on function public.reputation_level(integer) to service_role;
grant execute on function public.reserve_upload(uuid) to service_role;
grant execute on function public.search(text, integer) to service_role;
grant execute on function public.track_upload_allowance() to service_role;
grant execute on function public.weekly_helpful_leaders(date) to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
