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
-- Helpful that week (Monday to Sunday, Oslo time), by the same trust rules
-- as reputation: only owners whose marks count, at most helpful_per_giver
-- from each owner. A mark belongs to the week it was first given
-- (comments.first_helpful_at), so turning it off and on again does not
-- move it. profile_stats(user) gives the numbers on a profile, with Helpful
-- counted the same way as reputation. Both are
-- readable by anyone and only count live comments on tracks that were not
-- removed. The numbers mirror src/config/badges.ts.

-- When a comment was first marked Helpful. Never cleared or moved.
alter table public.comments add column first_helpful_at timestamptz;
update public.comments set first_helpful_at = helpful_at where is_helpful;
create index comments_first_helpful_idx on public.comments (first_helpful_at)
  where is_helpful and status = 'live';

create function private.comments_first_helpful()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Users have no grant on the column, so only this sets it.
  if new.is_helpful and new.first_helpful_at is null then
    new.first_helpful_at := coalesce(new.helpful_at, now());
  end if;
  return new;
end;
$$;

-- Named to run after comments_before_insert and comments_before_update,
-- which set helpful_at.
create trigger comments_first_helpful
  before insert or update on public.comments
  for each row execute function private.comments_first_helpful();

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
-- golden_ear, and a second look at ten_tracks_helped (owners whose marks
-- start counting when their account turns old enough), when reputation
-- goes up. The daily reputation job triggers this too.
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
  if not exists (
    select 1 from public.badges where user_id = new.id and badge = 'ten_tracks_helped'
  ) and private.helpful_owner_count(new.id) >= 10 then
    perform private.award_badge(new.id, 'ten_tracks_helped');
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  week date := date_trunc('week', coalesce(p_week_start, private.oslo_week_start(now()))::timestamp)::date;
  starts timestamptz := week::timestamp at time zone 'Europe/Oslo';
  ends timestamptz := (week + 7)::timestamp at time zone 'Europe/Oslo';
  rules public.trust_rules := private.trust_rules();
begin
  -- Only this week and the two years before it.
  if week > private.oslo_week_start(now()) or week < private.oslo_week_start(now()) - 728 then
    return;
  end if;

  return query
  with marks as (
    select c.author_id, t.owner_id, count(*) as n, max(c.first_helpful_at) as last_at
    from public.comments c
    join public.tracks t on t.id = c.track_id
    join public.profiles g on g.id = t.owner_id
    where c.is_helpful
      and c.status = 'live'
      and c.first_helpful_at >= starts
      and c.first_helpful_at < ends
      and t.status <> 'deleted'
      and private.helpful_giver_counts(g, rules)
    group by c.author_id, t.owner_id
  )
  select p.id, p.handle, p.display_name, p.avatar_url, p.avatar_key, p.reputation,
    sum(least(m.n, rules.helpful_per_giver))::integer as helpful
  from marks m
  join public.profiles p on p.id = m.author_id
  where p.banned_at is null
  group by p.id
  order by helpful desc, max(m.last_at) asc, p.handle
  limit 10;
end;
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

  -- Comments on other people's tracks, the kind that can be Helpful.
  select count(*)::integer into given
  from public.comments c
  join public.tracks t on t.id = c.track_id
  where c.author_id = p_user and c.status = 'live' and t.status <> 'deleted' and t.owner_id <> p_user;

  -- Helpful that counts, the same number as reputation.
  helpful := private.compute_reputation(p_user);

  -- Weeks in a row with such a comment, counting back from this week, or
  -- from last week while this one has none yet.
  week := private.oslo_week_start(now());
  for i in 0..520 loop
    if exists (
      select 1 from public.comments c
      join public.tracks t on t.id = c.track_id
      where c.author_id = p_user
        and c.status = 'live'
        and t.status <> 'deleted'
        and t.owner_id <> p_user
        and c.created_at >= (week::timestamp at time zone 'Europe/Oslo')
        and c.created_at < ((week + 7)::timestamp at time zone 'Europe/Oslo')
    ) then
      streak := streak + 1;
    elsif i > 0 then
      exit;
    end if;
    week := week - 7;
  end loop;

  return query
  select given, helpful,
    case when given = 0 then 0 else round(least(helpful, given)::numeric / given, 3) end,
    streak,
    coalesce((select array_agg(b.badge order by b.awarded_at) from public.badges b where b.user_id = p_user), '{}');
end;
$$;

revoke execute on function private.comments_first_helpful() from public, anon, authenticated;
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
