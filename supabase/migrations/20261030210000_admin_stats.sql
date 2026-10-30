-- Numbers for /admin/stats (plan parts 10 and 12).
--
-- "Today" starts at midnight Oslo time, where the only admin lives.
--
-- The north star is the share of tracks that get at least one comment from
-- someone other than the uploader within 48 hours. Only live tracks and live
-- comments count, so spam that was hidden or removed does not move it, and a
-- track only counts once its 48 hours are over. `waiting_tracks` are the
-- live tracks still inside their 48 hours without a comment: the ones to
-- listen to first.

create function public.admin_stats()
returns table (
  tracks_today integer,
  comments_today integer,
  users_today integer,
  helpful_today integer,
  reports_today integer,
  open_reports integer,
  live_tracks integer,
  live_comments integer,
  users_total integer,
  north_star_30d_tracks integer,
  north_star_30d_hits integer,
  north_star_all_tracks integer,
  north_star_all_hits integer,
  waiting_tracks integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today timestamptz := date_trunc('day', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
begin
  perform private.require_admin();
  return query
  with judged as (
    select t.created_at,
      exists (
        select 1 from public.comments c
        where c.track_id = t.id
          and c.author_id <> t.owner_id
          and c.status = 'live'
          and c.created_at <= t.created_at + interval '48 hours'
      ) as hit
    from public.tracks t
    where t.status = 'live' and t.created_at <= now() - interval '48 hours'
  )
  select
    (select count(*)::integer from public.tracks where created_at >= today),
    (select count(*)::integer from public.comments where created_at >= today),
    (select count(*)::integer from public.profiles where created_at >= today),
    (select count(*)::integer from public.comments where helpful_at >= today),
    (select count(*)::integer from public.reports where created_at >= today),
    (select count(*)::integer from public.reports where status = 'open'),
    (select count(*)::integer from public.tracks where status = 'live'),
    (select count(*)::integer from public.comments where status = 'live'),
    (select count(*)::integer from public.profiles),
    (select count(*)::integer from judged where created_at > now() - interval '30 days 48 hours'),
    (select count(*)::integer from judged where hit and created_at > now() - interval '30 days 48 hours'),
    (select count(*)::integer from judged),
    (select count(*)::integer from judged where hit),
    (select count(*)::integer from public.tracks t
      where t.status = 'live'
        and t.created_at > now() - interval '48 hours'
        and not exists (
          select 1 from public.comments c
          where c.track_id = t.id and c.author_id <> t.owner_id and c.status = 'live'
        ));
end;
$$;

comment on function public.admin_stats() is
  'Admin only. Today''s numbers and the north star (share of live tracks with a comment from someone else within 48 hours).';

revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
