-- One reaction per person per track.
--
-- A person picks one of the four reactions (or none). The app inserts a
-- reaction when the person has none, updates `kind` to change it, and
-- deletes it to take it back. (An upsert from the API would also try to set
-- track_id, which users have no grant for.) Changing keeps the time it was
-- first given, so switching back and forth does not lift a track in
-- Trending, and it counts against the hourly reaction limit like adding one.
--
-- Where someone had several, the newest is kept.

-- One statement, so the lock holds from the clean up to the new key and
-- no reaction slips in between.
do $$
begin
  lock table public.reactions in share row exclusive mode;

  delete from public.reactions r
  using public.reactions newer
  where newer.track_id = r.track_id
    and newer.user_id = r.user_id
    and (newer.created_at, newer.kind::text) > (r.created_at, r.kind::text);

  alter table public.reactions drop constraint reactions_pkey;
  alter table public.reactions add primary key (track_id, user_id);
end;
$$;

grant update (kind) on public.reactions to authenticated;

create policy "Users change their own reaction" on public.reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.tracks t
      where t.id = reactions.track_id and t.status = 'live'
    )
  );

-- Changing the reaction counts like adding one (rate limit), and the
-- counts on the track follow. An update that keeps the same kind is free.
create or replace function private.reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.kind is not distinct from old.kind then
    return new;
  end if;
  perform private.consume_rate_limit(new.user_id, 'reaction');
  return new;
end;
$$;

revoke execute on function private.reactions_before_insert() from public, anon, authenticated;

drop trigger reactions_before_insert on public.reactions;
create trigger reactions_before_insert
  before insert or update of kind on public.reactions
  for each row execute function private.reactions_before_insert();

drop trigger reactions_after_write on public.reactions;
create trigger reactions_after_write
  after insert or update or delete on public.reactions
  for each row execute function private.reactions_after_write();

-- Counts after removing the extra reactions.
update public.tracks t
set reaction_counts = coalesce((
  select jsonb_object_agg(kind, n)
  from (
    select kind, count(*) as n from public.reactions r
    where r.track_id = t.id group by kind
  ) counts
), '{}'::jsonb)
where t.reaction_counts <> coalesce((
  select jsonb_object_agg(kind, n)
  from (
    select kind, count(*) as n from public.reactions r
    where r.track_id = t.id group by kind
  ) counts
), '{}'::jsonb);
