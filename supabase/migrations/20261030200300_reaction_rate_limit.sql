-- Issue 006: reactions had no rate limit, and every insert or delete
-- re-aggregates the track's reaction counts, so a script toggling one
-- reaction could load a popular track row without end. Adding a reaction
-- now counts against reactions_per_hour (src/config/reputation.ts);
-- removing one is free, since it needs an add first.

alter table private.rate_limit_events drop constraint rate_limit_events_action_check;
alter table private.rate_limit_events add constraint rate_limit_events_action_check
  check (action in ('track', 'comment', 'report', 'upload', 'reaction'));

alter table public.reputation_levels
  add column reactions_per_hour integer not null default 120 check (reactions_per_hour > 0);

create or replace function private.consume_rate_limit(p_user uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  helpful integer;
  lim public.reputation_levels;
  used_hour integer;
  used_day integer;
  used_week integer;
begin
  if private.is_seeding() then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action || ':' || p_user::text, 0));

  select reputation into helpful from public.profiles where id = p_user;
  lim := public.reputation_level(coalesce(helpful, 0));

  select
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*) filter (where created_at > now() - interval '1 day'),
    count(*)
  into used_hour, used_day, used_week
  from private.rate_limit_events
  where user_id = p_user
    and action = p_action
    and created_at > now() - interval '7 days';

  if (p_action = 'track' and used_day >= lim.tracks_per_day) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'tracks_per_day',
        hint = format('You can upload %s tracks per day.', lim.tracks_per_day);
  elsif (p_action = 'track' and used_week >= lim.tracks_per_week) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'tracks_per_week',
        hint = format('You can upload %s tracks per week.', lim.tracks_per_week);
  elsif (p_action = 'comment' and used_hour >= lim.comments_per_hour) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'comments_per_hour',
        hint = format('You can post %s comments per hour.', lim.comments_per_hour);
  elsif (p_action = 'report' and used_day >= lim.reports_per_day) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'reports_per_day',
        hint = format('You can send %s reports per day.', lim.reports_per_day);
  elsif (p_action = 'reaction' and used_hour >= lim.reactions_per_hour) then
    raise exception 'rate_limited'
      using errcode = 'PT429', detail = 'reactions_per_hour',
        hint = format('You can add %s reactions per hour.', lim.reactions_per_hour);
  end if;

  insert into private.rate_limit_events (user_id, action) values (p_user, p_action);
end;
$$;

create function private.reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.consume_rate_limit(new.user_id, 'reaction');
  return new;
end;
$$;

revoke execute on function private.reactions_before_insert() from public, anon, authenticated;

create trigger reactions_before_insert
  before insert on public.reactions
  for each row execute function private.reactions_before_insert();
