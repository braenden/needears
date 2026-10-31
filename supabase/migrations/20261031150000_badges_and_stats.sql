-- Badges, the weekly list of most helpful ears, and profile stats.
--
-- Badges reward what makes feedback better, never volume, and are never
-- taken back:
--   first_ears          first live comment from anyone but the uploader on
--                       a track that had none
--   finisher            uploaded a new version of a track after someone
--                       else commented on it
--   ten_tracks_helped   Helpful from ten different track owners whose marks
--                       count (the trust rules: not banned, account old
--                       enough)
--   golden_ear          reached the Golden ear level
--
-- weekly_helpful_leaders(week) lists the ten people who received the most
-- Helpful that week (Monday to Sunday, Oslo time), counting only marks that
-- count. profile_stats(user) gives the numbers on a profile. Both are
-- readable by anyone and only count live comments on tracks that were not
-- removed. The numbers mirror src/config/badges.ts.

create type public.badge_kind as enum ('first_ears', 'finisher', 'ten_tracks_helped', 'golden_ear');

create table public.badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge public.badge_kind not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge)
);

alter table public.badges enable row level security;
revoke all on public.badges from anon, authenticated;
grant select on public.badges to anon, authenticated;
create policy "Badges are public" on public.badges
  for select to anon, authenticated using (true);

create function private.award_badge(p_user uuid, p_badge public.badge_kind)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.badges (user_id, badge) values (p_user, p_badge)
  on conflict do nothing;
$$;

-- Distinct track owners whose Helpful marks on this person's live comments
-- count under the trust rules.
create function private.helpful_owner_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct t.owner_id)::integer
  from public.comments c
  join public.tracks t on t.id = c.track_id
  join public.profiles g on g.id = t.owner_id
  cross join private.trust_rules() r
  where c.author_id = p_user
    and c.is_helpful
    and c.status = 'live'
    and t.status <> 'deleted'
    and private.helpful_giver_counts(g, r);
$$;

-- first_ears, on a new comment.
create function private.comments_award_first_ears()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.tracks where id = new.track_id;
  if new.status = 'live'
    and new.author_id <> owner
    and not exists (
      select 1 from public.comments c
      where c.track_id = new.track_id
        and c.id <> new.id
        and c.author_id <> owner
        and c.status = 'live'
    )
  then
    perform private.award_badge(new.author_id, 'first_ears');
  end if;
  return null;
end;
$$;

create trigger comments_award_first_ears
  after insert on public.comments
  for each row execute function private.comments_award_first_ears();

-- ten_tracks_helped, when a comment is marked Helpful.
create function private.comments_award_helped()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.badges where user_id = new.author_id and badge = 'ten_tracks_helped'
  ) and private.helpful_owner_count(new.author_id) >= 10 then
    perform private.award_badge(new.author_id, 'ten_tracks_helped');
  end if;
  return null;
end;
$$;

create trigger comments_award_helped
  after update of is_helpful on public.comments
  for each row
  when (new.is_helpful and not old.is_helpful)
  execute function private.comments_award_helped();

-- finisher, on version 2 and up of a track someone else commented on.
create function private.track_versions_award_finisher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if new.version_no < 2 then
    return null;
  end if;
  select owner_id into owner from public.tracks where id = new.track_id;
  if exists (
    select 1 from public.comments c
    where c.track_id = new.track_id and c.author_id <> owner and c.status = 'live'
  ) then
    perform private.award_badge(owner, 'finisher');
  end if;
  return null;
end;
$$;

create trigger track_versions_award_finisher
  after insert on public.track_versions
  for each row execute function private.track_versions_award_finisher();

-- golden_ear, when reputation reaches the level.
create function private.profiles_award_golden_ear()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (public.reputation_level(new.reputation)).id = 'golden_ear' then
    perform private.award_badge(new.id, 'golden_ear');
  end if;
  return null;
end;
$$;

create trigger profiles_award_golden_ear
  after update of reputation on public.profiles
  for each row
  when (new.reputation > old.reputation)
  execute function private.profiles_award_golden_ear();

-- Badges earned before this migration.
insert into public.badges (user_id, badge, awarded_at)
select distinct on (c.track_id) c.author_id, 'first_ears'::public.badge_kind, c.created_at
from public.comments c
join public.tracks t on t.id = c.track_id
where c.status = 'live' and c.author_id <> t.owner_id
order by c.track_id, c.created_at
on conflict do nothing;

insert into public.badges (user_id, badge)
select p.id, 'ten_tracks_helped' from public.profiles p
where private.helpful_owner_count(p.id) >= 10
on conflict do nothing;

insert into public.badges (user_id, badge)
select p.id, 'golden_ear' from public.profiles p
where exists (select 1 from public.reputation_levels l where l.id = 'golden_ear' and p.reputation >= l.min_helpful)
on conflict do nothing;

-- Weekly list ----------------------------------------------------------------

-- The Monday a date falls in, in Oslo time.
create function private.oslo_week_start(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', (p_at at time zone 'Europe/Oslo'))::date;
$$;

create function public.weekly_helpful_leaders(p_week_start date default null)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  avatar_key text,
  reputation integer,
  helpful integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with week as (
    select
      (date_trunc('week', coalesce(p_week_start, private.oslo_week_start(now()))::timestamp)
        at time zone 'Europe/Oslo') as starts
  )
  select p.id, p.handle, p.display_name, p.avatar_url, p.avatar_key, p.reputation,
    count(*)::integer as helpful
  from public.comments c
  join public.tracks t on t.id = c.track_id
  join public.profiles g on g.id = t.owner_id
  join public.profiles p on p.id = c.author_id
  cross join week
  cross join private.trust_rules() r
  where c.is_helpful
    and c.status = 'live'
    and t.status <> 'deleted'
    and p.banned_at is null
    and c.helpful_at >= week.starts
    and c.helpful_at < week.starts + interval '7 days'
    and private.helpful_giver_counts(g, r)
  group by p.id
  order by helpful desc, max(c.helpful_at) asc, p.handle
  limit 10;
$$;

-- Profile stats ----------------------------------------------------------------

create function public.profile_stats(p_user uuid)
returns table (
  comments_given integer,
  helpful_received integer,
  helpful_share numeric,
  week_streak integer,
  badges public.badge_kind[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  given integer;
  helpful integer;
  streak integer := 0;
  week date;
begin
  if not exists (select 1 from public.profiles where id = p_user and banned_at is null) then
    return;
  end if;

  select count(*)::integer, count(*) filter (where c.is_helpful)::integer
  into given, helpful
  from public.comments c
  join public.tracks t on t.id = c.track_id
  where c.author_id = p_user and c.status = 'live' and t.status <> 'deleted' and t.owner_id <> p_user;

  -- Weeks in a row with a comment, counting back from this week, or from
  -- last week while this one has none yet.
  week := private.oslo_week_start(now());
  if not exists (
    select 1 from public.comments c
    where c.author_id = p_user and c.status = 'live'
      and private.oslo_week_start(c.created_at) = week
  ) then
    week := week - 7;
  end if;
  while exists (
    select 1 from public.comments c
    where c.author_id = p_user and c.status = 'live'
      and c.created_at >= (week::timestamp at time zone 'Europe/Oslo')
      and c.created_at < ((week + 7)::timestamp at time zone 'Europe/Oslo')
  ) and streak < 520 loop
    streak := streak + 1;
    week := week - 7;
  end loop;

  return query
  select given, helpful,
    case when given = 0 then 0 else round(helpful::numeric / given, 3) end,
    streak,
    coalesce((select array_agg(b.badge order by b.awarded_at) from public.badges b where b.user_id = p_user), '{}');
end;
$$;

revoke execute on function private.award_badge(uuid, public.badge_kind) from public, anon, authenticated;
revoke execute on function private.helpful_owner_count(uuid) from public, anon, authenticated;
revoke execute on function private.comments_award_first_ears() from public, anon, authenticated;
revoke execute on function private.comments_award_helped() from public, anon, authenticated;
revoke execute on function private.track_versions_award_finisher() from public, anon, authenticated;
revoke execute on function private.profiles_award_golden_ear() from public, anon, authenticated;
revoke execute on function private.oslo_week_start(timestamptz) from public, anon, authenticated;
revoke execute on function public.weekly_helpful_leaders(date) from public;
revoke execute on function public.profile_stats(uuid) from public;
grant execute on function public.weekly_helpful_leaders(date) to anon, authenticated;
grant execute on function public.profile_stats(uuid) to anon, authenticated;
