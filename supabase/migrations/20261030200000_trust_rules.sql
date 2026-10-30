-- Trust rules for reputation and auto hide.
--
-- Reputation farming: one track owner could mark every comment of a second account Helpful
-- and lift it to Golden ear in an hour. Now one owner gives one person at
-- most `helpful_per_giver` reputation, and Helpful from an owner who is
-- banned or whose account is younger than `giver_min_age_days` does not count
-- (it starts counting when the account is old enough; a daily job catches up).
--
-- Auto hide abuse: three day old accounts of one person could auto hide anything. Now a
-- report only counts toward auto hide if the reporter's account is at least
-- `reporter_min_age_days` old and has at least `reporter_min_reputation`,
-- which means someone else has found one of their comments Helpful.
--
-- The numbers live in src/config/reputation.ts, like the levels. The row
-- below is the default so the functions work before the seed file runs;
-- supabase/seeds/reputation.sql overwrites it.

create table public.trust_rules (
  id boolean primary key default true check (id),
  helpful_per_giver integer not null check (helpful_per_giver > 0),
  giver_min_age_days integer not null check (giver_min_age_days >= 0),
  reporter_min_age_days integer not null check (reporter_min_age_days >= 0),
  reporter_min_reputation integer not null check (reporter_min_reputation >= 0),
  auto_hide_reports integer not null check (auto_hide_reports > 0)
);

comment on table public.trust_rules is
  'Generated from src/config/reputation.ts. Do not edit by hand.';

insert into public.trust_rules
  (id, helpful_per_giver, giver_min_age_days, reporter_min_age_days, reporter_min_reputation, auto_hide_reports)
values (true, 3, 7, 7, 1, 3);

alter table public.trust_rules enable row level security;
-- New tables in public get every privilege by default; read only here.
revoke all on public.trust_rules from anon, authenticated;
grant select on public.trust_rules to anon, authenticated;
create policy "Trust rules are public" on public.trust_rules
  for select to anon, authenticated using (true);

-- Like the levels: no row means fail loudly, never "no rules".
create function private.trust_rules()
returns public.trust_rules
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result public.trust_rules;
begin
  select * into result from public.trust_rules where id;
  if not found then
    raise exception 'trust rules missing'
      using hint = 'Apply supabase/seeds/reputation.sql (pnpm db:config).';
  end if;
  return result;
end;
$$;

-- Whether Helpful from this track owner counts toward reputation and the
-- feed lift.
create function private.helpful_giver_counts(p_giver public.profiles, p_rules public.trust_rules)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_giver.banned_at is null
    and p_giver.created_at <= now() - make_interval(days => p_rules.giver_min_age_days);
$$;

-- Reputation: live Helpful comments, at most helpful_per_giver from each
-- track owner, counting only owners that pass helpful_giver_counts and
-- tracks an admin has not removed (status deleted). Tracks hidden by
-- reports still count, so auto hide cannot take honest reputation away.
create function private.compute_reputation(p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rules public.trust_rules := private.trust_rules();
  total integer;
begin
  select coalesce(sum(least(per_giver.marks, rules.helpful_per_giver)), 0)
  into total
  from (
    select t.owner_id, count(*) as marks
    from public.comments c
    join public.tracks t on t.id = c.track_id
    join public.profiles g on g.id = t.owner_id
    where c.author_id = p_user
      and c.is_helpful
      and c.status = 'live'
      and t.status <> 'deleted'
      and private.helpful_giver_counts(g, rules)
    group by t.owner_id
  ) per_giver;
  return total;
end;
$$;

create or replace function private.refresh_reputation(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set reputation = private.compute_reputation(p_user)
  where id = p_user;
$$;

-- Daily catch up: Helpful from owners who have since turned old enough, and
-- anything a ban or unban changed.
create function private.refresh_all_reputation()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles p
  set reputation = private.compute_reputation(p.id)
  where (p.reputation > 0
      or exists (select 1 from public.comments c where c.author_id = p.id and c.is_helpful))
    and p.reputation is distinct from private.compute_reputation(p.id);
$$;

select cron.schedule('refresh-reputation', '37 3 * * *', 'select private.refresh_all_reputation()');

-- The feed lift follows the same rule: a mark from an owner that does not
-- count gives no lift either.
create or replace function private.is_recent_giver(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.comments c
    join public.tracks t on t.id = c.track_id
    join public.profiles g on g.id = t.owner_id
    cross join private.trust_rules() r
    where c.author_id = p_user
      and c.is_helpful
      and c.status = 'live'
      and c.helpful_at > now() - interval '30 days'
      and t.status <> 'deleted'
      and private.helpful_giver_counts(g, r)
  );
$$;

-- Banning or unbanning an owner changes whether their Helpful marks count,
-- so the people they marked get their reputation recomputed at once.
create or replace function public.admin_set_banned(p_user uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user = (select auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501',
      detail = 'You cannot ban yourself.';
  end if;

  update public.profiles
  set banned_at = case when p_banned then coalesce(banned_at, now()) end
  where id = p_user;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  if p_banned then
    update public.tracks set status = 'hidden' where owner_id = p_user and status = 'live';
    update public.comments set status = 'hidden' where author_id = p_user and status = 'live';
  end if;

  perform private.refresh_reputation(marked.author_id)
  from (
    select distinct c.author_id
    from public.comments c
    join public.tracks t on t.id = c.track_id
    where t.owner_id = p_user and c.is_helpful
  ) marked;
end;
$$;

-- Auto hide counts only reporters with some standing.
create or replace function private.reports_auto_hide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules public.trust_rules := private.trust_rules();
  reporters integer;
begin
  select count(distinct r.reporter_id)
  into reporters
  from public.reports r
  join public.profiles p on p.id = r.reporter_id
  where r.status = 'open'
    and r.target_type = new.target_type
    and r.track_id is not distinct from new.track_id
    and r.comment_id is not distinct from new.comment_id
    and p.created_at <= now() - make_interval(days => rules.reporter_min_age_days)
    and p.reputation >= rules.reporter_min_reputation
    and p.banned_at is null;

  if reporters >= rules.auto_hide_reports then
    if new.target_type = 'track' then
      update public.tracks set status = 'hidden'
      where id = new.track_id and status = 'live';
    else
      update public.comments set status = 'hidden'
      where id = new.comment_id and status = 'live';
    end if;
  end if;

  return null;
end;
$$;

revoke execute on function private.trust_rules() from public, anon, authenticated;
revoke execute on function private.helpful_giver_counts(public.profiles, public.trust_rules) from public, anon, authenticated;
revoke execute on function private.compute_reputation(uuid) from public, anon, authenticated;
revoke execute on function private.refresh_all_reputation() from public, anon, authenticated;
revoke execute on function public.admin_set_banned(uuid, boolean) from public, anon;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;

-- Existing reputations under the new rule.
select private.refresh_all_reputation();
