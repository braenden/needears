-- Generated from src/config/reputation.ts by `pnpm db:config`. Do not edit.
delete from public.reputation_levels
where id not in ('new_ear', 'listener', 'trusted_ear', 'golden_ear');
insert into public.reputation_levels
  (id, name, min_helpful, tracks_per_day, tracks_per_week, comments_per_hour, reports_per_day, reactions_per_hour)
values
  ('new_ear', 'New ear', 0, 3, 10, 60, 20, 120),
  ('listener', 'Listener', 3, 3, 10, 60, 20, 120),
  ('trusted_ear', 'Trusted ear', 15, 3, 10, 120, 40, 240),
  ('golden_ear', 'Golden ear', 60, 3, 10, 180, 60, 360)
on conflict (id) do update set
  name = excluded.name,
  min_helpful = excluded.min_helpful,
  tracks_per_day = excluded.tracks_per_day,
  tracks_per_week = excluded.tracks_per_week,
  comments_per_hour = excluded.comments_per_hour,
  reports_per_day = excluded.reports_per_day,
  reactions_per_hour = excluded.reactions_per_hour;
insert into public.trust_rules
  (id, helpful_per_giver, giver_min_age_days, reporter_min_age_days, reporter_min_reputation, auto_hide_reports)
values
  (true, 3, 7, 7, 1, 3)
on conflict (id) do update set
  helpful_per_giver = excluded.helpful_per_giver,
  giver_min_age_days = excluded.giver_min_age_days,
  reporter_min_age_days = excluded.reporter_min_age_days,
  reporter_min_reputation = excluded.reporter_min_reputation,
  auto_hide_reports = excluded.auto_hide_reports;
