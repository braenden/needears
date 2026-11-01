-- Feed functions: only live tracks, Needs ears filter, genre filter,
-- paging limits and trending based on recent activity.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
\ir _helpers.psql

create temp table ids as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'live', 'jazz') as quiet,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'live', 'jazz') as busy,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'hidden', 'jazz') as hidden;
grant select on ids to anon;

insert into public.comments (track_id, author_id, body)
select busy, author, 'Comment' from ids,
  unnest(array['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444']::uuid[]) as author;
insert into public.comments (track_id, author_id, body)
select hidden, '22222222-2222-4222-8222-222222222222', 'Comment' from ids;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;

select is_empty(
  $$ select 1 from public.feed_latest(p_page_size => 50) where status <> 'live'
     union all select 1 from public.feed_needs_ears(p_page_size => 50) where status <> 'live'
     union all select 1 from public.feed_trending(p_page_size => 50) where status <> 'live' $$,
  'feeds only return live tracks'
);
select is_empty(
  $$ select 1 from public.feed_needs_ears(p_page_size => 50) where not needs_ears $$,
  'Needs ears only has tracks that still need ears'
);
select ok(
  exists (select 1 from public.feed_needs_ears('jazz') f join ids on f.id = ids.quiet),
  'a track without comments is in Needs ears'
);
select ok(
  not exists (select 1 from public.feed_needs_ears('jazz') f join ids on f.id = ids.busy),
  'a track with comments from three people is not in Needs ears'
);
select is_empty(
  $$ select 1 from public.feed_latest('jazz', 1, 50) f
     join public.genres g on g.id = f.genre_id where g.slug <> 'jazz' $$,
  'the genre filter works'
);
select is(
  (select count(*)::int from public.feed_latest(p_page_size => 1000)),
  (select least(count(*), 50)::int from public.tracks where status = 'live'),
  'page size is capped at 50'
);
select is(
  (select id from public.feed_latest(p_page => 2, p_page_size => 1)),
  (select id from public.feed_latest(p_page => 1, p_page_size => 2) offset 1),
  'paging returns the next rows'
);
select ok(
  exists (select 1 from public.feed_trending('jazz') f join ids on f.id = ids.busy),
  'a track with recent comments is trending'
);
select ok(
  not exists (select 1 from public.feed_trending('jazz') f join ids on f.id = ids.quiet),
  'a track without activity is not trending'
);
reset role;

select * from finish();
rollback;
