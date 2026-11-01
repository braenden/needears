-- "Needs ears": a live track needs ears until the artist marks a comment by
-- someone else as Helpful, or three people other than the artist have left
-- a live comment. The counts on tracks never include the artist.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
\ir _helpers.psql

-- Alice is the artist. Bob, carol and dave listen.
create temp table ids as
select pg_temp.make_track('11111111-1111-4111-8111-111111111111') as track;
grant select on ids to authenticated, service_role;

create function pg_temp.comment(p_author uuid, p_body text, p_parent text default null)
returns void
language sql
as $$
  insert into public.comments (track_id, author_id, body, parent_id)
  select track, p_author, p_body,
    (select id from public.comments where body = p_parent)
  from ids;
$$;

create function pg_temp.stats()
returns table (listeners integer, comments integer, helpful boolean, needs boolean)
language sql
as $$
  select listener_count, listener_comment_count, has_helpful, needs_ears
  from public.tracks where id = (select track from ids);
$$;

select results_eq(
  'select * from pg_temp.stats()',
  $$ values (0, 0, false, true) $$,
  'a new track needs ears'
);

-- The artist's own comments do not count.
select pg_temp.comment('11111111-1111-4111-8111-111111111111', 'Artist note');
select pg_temp.comment('11111111-1111-4111-8111-111111111111', 'Another note');
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (0, 0, false, true) $$,
  'the artist''s own comments do not count'
);
select is(
  (select comment_count from public.tracks where id = (select track from ids)),
  2,
  'comment_count still counts every live comment'
);

-- Bob comments, replies to himself and the artist answers him.
select pg_temp.comment('22222222-2222-4222-8222-222222222222', 'Kick is weak');
select pg_temp.comment('22222222-2222-4222-8222-222222222222', 'Also the snare', 'Kick is weak');
select pg_temp.comment('11111111-1111-4111-8111-111111111111', 'Thanks', 'Kick is weak');
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (1, 2, false, true) $$,
  'a reply by the same person does not count twice, and the artist''s reply not at all'
);

-- Carol comments; then dave, the third person.
select pg_temp.comment('33333333-3333-4333-8333-333333333333', 'Nice pads');
select ok((select needs from pg_temp.stats()), 'two people are not enough');
select pg_temp.comment('44444444-4444-4444-8444-444444444444', 'Vocals too loud');
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (3, 4, false, false) $$,
  'three people end it'
);
select ok(
  not exists (select 1 from public.feed_needs_ears(p_page_size => 50) f join ids on f.id = ids.track),
  'and the track leaves the Needs ears feed'
);

-- Hidden and removed comments do not count.
update public.comments set status = 'hidden' where body = 'Vocals too loud';
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (2, 3, false, true) $$,
  'a hidden comment does not count'
);
update public.comments set status = 'deleted' where body = 'Nice pads';
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (1, 2, false, true) $$,
  'a removed comment does not count'
);
select ok(
  exists (select 1 from public.feed_needs_ears(p_page_size => 50) f join ids on f.id = ids.track),
  'so the track is back in Needs ears'
);

-- The artist marks bob's comment Helpful, then takes it back.
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
update public.comments set is_helpful = true where body = 'Kick is weak';
reset role;
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (1, 2, true, false) $$,
  'Helpful from the artist on someone else''s comment ends it'
);
set local role authenticated;
update public.comments set is_helpful = false where body = 'Kick is weak';
reset role;
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (1, 2, false, true) $$,
  'unmarking brings it back'
);

-- A Helpful comment that is hidden no longer counts.
set local role authenticated;
update public.comments set is_helpful = true where body = 'Kick is weak';
reset role;
update public.comments set status = 'hidden' where body = 'Kick is weak';
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (1, 1, false, true) $$,
  'a hidden Helpful comment does not end it'
);

-- A deleted comment goes from the counts.
delete from public.comments where body = 'Also the snare';
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (0, 0, false, true) $$,
  'deleting a comment updates the counts'
);

-- A shadow banned listener's comment is stored hidden and does not count.
update public.profiles set banned_at = now() where id = '33333333-3333-4333-8333-333333333333';
select pg_temp.comment('33333333-3333-4333-8333-333333333333', 'From a banned account');
select results_eq(
  'select * from pg_temp.stats()',
  $$ values (0, 0, false, true) $$,
  'a shadow banned listener''s comment does not count'
);

-- Counts given on insert are ignored.
select pg_temp.make_objects('22222222-2222-4222-8222-222222222222', 'f1000000-0000-4000-8000-000000000001');
set local role service_role;
insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key,
  listener_count, listener_comment_count, has_helpful)
values ('22222222-2222-4222-8222-222222222222', 'Inflated', 1, 5000,
  '22222222-2222-4222-8222-222222222222/f1000000-0000-4000-8000-000000000001.mp3',
  '22222222-2222-4222-8222-222222222222/f1000000-0000-4000-8000-000000000001.json', 5, 9, true);
reset role;
select results_eq(
  $$ select listener_count, listener_comment_count, has_helpful, needs_ears
     from public.tracks where title = 'Inflated' $$,
  $$ values (0, 0, false, true) $$,
  'counts given on insert are reset'
);

-- Hidden tracks never need ears, and nobody can set the counts.
update public.tracks set status = 'hidden' where id = (select track from ids);
select ok(not (select needs from pg_temp.stats()), 'a hidden track does not need ears');
select ok(
  not has_column_privilege('authenticated', 'public.tracks', 'listener_count', 'update')
    and not has_column_privilege('authenticated', 'public.tracks', 'listener_comment_count', 'update')
    and not has_column_privilege('authenticated', 'public.tracks', 'has_helpful', 'update'),
  'users cannot change the counts'
);

select * from finish();
rollback;
