-- Groups. Most of all: a group is its own world. Nobody outside it gets
-- anything about a song in it from any path, and nothing in it counts
-- outside it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(118);
\ir _helpers.psql

-- frank teaches and makes the group with a new account. bob and erin are
-- students, carol stays outside, alice asks and hears no, dave is an admin.
select pg_temp.make_user('55555555-5555-4555-8555-555555555555', 'erin');
select pg_temp.make_user('66666666-6666-4666-8666-666666666666', 'frank', interval '1 hour');

create function pg_temp.as_user(p_user uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Writes the test makes itself, as the server would.
create function pg_temp.as_server()
returns void
language sql
as $$
  select set_config('request.jwt.claims', '{"role": "service_role"}', true);
$$;

create function pg_temp.as_anon()
returns void
language sql
as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true);
$$;

-- A song uploaded in a group, as the upload route inserts it.
create function pg_temp.make_group_track(p_owner uuid, p_group uuid, p_title text)
returns uuid
language plpgsql
as $$
declare
  tid uuid := gen_random_uuid();
  obj uuid := gen_random_uuid();
begin
  perform set_config('needears.seeding', 'on', true);
  insert into public.tracks (id, owner_id, title, genre_id, duration_ms, audio_key, peaks_key, status, group_id)
  values (tid, p_owner, p_title, (select id from public.genres where slug = 'house'), 60000,
    p_owner || '/' || obj || '.mp3', p_owner || '/' || obj || '.json', 'live', p_group);
  perform set_config('needears.seeding', 'off', true);
  return tid;
end;
$$;

create temp table g (name text primary key, id uuid, slug text);
create temp table t (name text primary key, id uuid);
grant all on g, t to anon, authenticated, service_role;

-- Making a group -----------------------------------------------------------------
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select lives_ok(
  $$ insert into g (name, id, slug) select 'class', id, slug from public.create_group('  Mix class H26 ') $$,
  'a new account makes a group the same day'
);
select throws_ok(
  $$ select * from public.create_group('Second today') $$,
  'PT429', 'rate_limited', 'one new group a day'
);
select throws_ok(
  $$ select * from public.create_group('   ') $$,
  '22023', 'invalid_name', 'a group needs a name'
);
reset role;
select results_eq(
  $$ select name, members_count from public.groups where id = (select id from g where name = 'class') $$,
  $$ values ('Mix class H26', 1) $$,
  'a trimmed name, and the owner is its first member'
);
select is(
  (select role::text from public.group_members
   where group_id = (select id from g where name = 'class') and user_id = '66666666-6666-4666-8666-666666666666'),
  'owner',
  'the maker is its owner'
);
delete from private.rate_limit_events where action = 'group_create';
insert into public.groups (slug, name, owner_id)
select 'extra-' || n, 'Extra ' || n, '66666666-6666-4666-8666-666666666666' from generate_series(1, 2) n;
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select throws_ok(
  $$ select * from public.create_group('Fourth') $$,
  '22023', 'too_many_groups', 'three groups at most'
);
reset role;
delete from public.groups where slug like 'extra-%';
delete from private.rate_limit_events where action = 'group_create';

-- The card and search: what anyone sees ------------------------------------------
select pg_temp.as_anon();
set local role anon;
select results_eq(
  $$ select gr.name, gr.members_count, p.display_name
     from public.groups gr join public.profiles p on p.id = gr.owner_id
     where gr.id = (select id from g where name = 'class') $$,
  $$ select 'Mix class H26', 1, (select display_name from public.profiles where handle = 'frank') $$,
  'signed out, the card shows the name, the owner and the member count'
);
select results_eq(
  $$ select slug, name, members_count, owner_name, owner_handle from public.search_groups('mix class') $$,
  $$ select (select slug from g where name = 'class'), 'Mix class H26', 1,
       (select display_name from public.profiles where handle = 'frank'), 'frank' $$,
  'search finds the group by name, with its card'
);
select is(
  (select count(*)::int from public.search_groups('mix clas')),
  1,
  'also from the start of a word'
);
select is(
  (select count(*)::int from public.group_members where group_id = (select id from g where name = 'class')),
  0,
  'but not who is in it'
);
select results_eq(
  $$ select is_member, asked, ask_again_at, removed, is_full from public.group_status((select id from g where name = 'class')) $$,
  $$ values (false, false, null::timestamptz, false, false) $$,
  'signed out, the card says nothing more than that'
);
reset role;

-- Asking to join ------------------------------------------------------------------
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select is(public.ask_to_join((select id from g where name = 'class')), 'pending', 'bob asks to join');
select is(public.ask_to_join((select id from g where name = 'class')), 'pending', 'asking again changes nothing');
select is(
  (select count(*)::int from public.group_join_requests where group_id = (select id from g where name = 'class')),
  1,
  'bob sees his ask'
);
select results_eq(
  $$ select is_member, asked from public.group_status((select id from g where name = 'class')) $$,
  $$ values (false, true) $$,
  'and his card says he has asked'
);
reset role;
select results_eq(
  $$ select kind::text, actor_id from public.notifications
     where user_id = '66666666-6666-4666-8666-666666666666' and group_id = (select id from g where name = 'class') $$,
  $$ values ('group_request', '22222222-2222-4222-8222-222222222222'::uuid) $$,
  'the owner hears once that someone asks'
);
select pg_temp.as_user('55555555-5555-4555-8555-555555555555');
set local role authenticated;
select public.ask_to_join((select id from g where name = 'class'));
reset role;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select public.ask_to_join((select id from g where name = 'class'));
reset role;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select is(
  (select count(*)::int from public.group_join_requests),
  0,
  'someone else sees nobody''s asks'
);
reset role;
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select is(
  (select count(*)::int from public.group_join_requests where group_id = (select id from g where name = 'class')),
  3,
  'the owner sees the three asks'
);
select results_eq(
  $$ select name, role::text, members_count, asks from public.my_groups() $$,
  $$ values ('Mix class H26', 'owner', 1, 3) $$,
  'the owner''s list of groups says how many are waiting'
);
reset role;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok(
  $$ select public.answer_ask((select id from g where name = 'class'), '55555555-5555-4555-8555-555555555555', true) $$,
  'P0002', 'not_found', 'only the owner answers'
);
reset role;

-- Yes.
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select lives_ok(
  $$ select public.answer_ask((select id from g where name = 'class'), '22222222-2222-4222-8222-222222222222', true) $$,
  'the owner lets bob in'
);
select public.answer_ask((select id from g where name = 'class'), '55555555-5555-4555-8555-555555555555', true);
reset role;
select results_eq(
  $$ select
       (select members_count from public.groups where id = (select id from g where name = 'class')),
       (select count(*)::int from public.group_join_requests where user_id = '22222222-2222-4222-8222-222222222222'),
       (select count(*)::int from public.notifications where user_id = '22222222-2222-4222-8222-222222222222' and kind = 'group_joined'),
       (select count(*)::int from public.notifications where user_id = '66666666-6666-4666-8666-666666666666'
          and kind = 'group_request' and actor_id = '22222222-2222-4222-8222-222222222222') $$,
  $$ values (3, 0, 1, 0) $$,
  'a yes makes a member, ends the ask, tells the asker, and clears the owner''s notice'
);
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select is(public.ask_to_join((select id from g where name = 'class')), 'member', 'a member asking is told so');
reset role;

-- No, quietly.
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select lives_ok(
  $$ select public.answer_ask((select id from g where name = 'class'), '11111111-1111-4111-8111-111111111111', false) $$,
  'the owner says no to alice'
);
reset role;
select is(
  (select count(*)::int from public.notifications where user_id = '11111111-1111-4111-8111-111111111111'),
  0,
  'a no tells nobody'
);
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select is(
  (select count(*)::int from public.group_join_requests),
  0,
  'and alice sees no ask any more'
);
select ok(
  (select not asked and ask_again_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
   from public.group_status((select id from g where name = 'class'))),
  'her card says from when she can ask again'
);
select throws_ok(
  $$ select public.ask_to_join((select id from g where name = 'class')) $$,
  '22023', 'asked_recently', 'after a no, not again within 7 days'
);
reset role;
update public.group_join_requests set decided_at = now() - interval '8 days'
where user_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select is(public.ask_to_join((select id from g where name = 'class')), 'pending', 'after 7 days she can ask again');
select lives_ok($$ select public.withdraw_ask((select id from g where name = 'class')) $$, 'and take it back');
reset role;
select results_eq(
  $$ select
       (select count(*)::int from public.group_join_requests where user_id = '11111111-1111-4111-8111-111111111111'),
       (select count(*)::int from public.notifications where user_id = '66666666-6666-4666-8666-666666666666'
          and actor_id = '11111111-1111-4111-8111-111111111111') $$,
  $$ values (0, 0) $$,
  'a withdrawn ask is gone, and so is the owner''s notice'
);

-- Limits on asking.
insert into private.rate_limit_events (user_id, action)
select '33333333-3333-4333-8333-333333333333', 'group_ask' from generate_series(1, 10);
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select throws_ok(
  $$ select public.ask_to_join((select id from g where name = 'class')) $$,
  'PT429', 'rate_limited', 'at most 10 asks a day'
);
reset role;
delete from private.rate_limit_events where action = 'group_ask';
update public.groups set members_count = 50 where id = (select id from g where name = 'class');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select throws_ok(
  $$ select public.ask_to_join((select id from g where name = 'class')) $$,
  '22023', 'group_full', 'nobody asks to join a full group'
);
select is(
  (select is_full from public.group_status((select id from g where name = 'class'))),
  true,
  'the card says the group is full'
);
reset role;
insert into public.group_join_requests (group_id, user_id)
values ((select id from g where name = 'class'), '33333333-3333-4333-8333-333333333333');
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select throws_ok(
  $$ select public.answer_ask((select id from g where name = 'class'), '33333333-3333-4333-8333-333333333333', true) $$,
  '22023', 'group_full', 'and a yes holds the cap of 50'
);
reset role;
delete from public.group_join_requests where user_id = '33333333-3333-4333-8333-333333333333';
update public.groups set members_count = 3 where id = (select id from g where name = 'class');
update public.profiles set banned_at = now() where handle = 'carol';
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select throws_ok(
  $$ select public.ask_to_join((select id from g where name = 'class')) $$,
  '42501', 'not_allowed', 'a banned account cannot ask'
);
reset role;
update public.profiles set banned_at = null where handle = 'carol';

-- A banned owner's group stops growing and drops out of sight for others.
update public.profiles set banned_at = now() where handle = 'frank';
select pg_temp.as_anon();
set local role anon;
select results_eq(
  $$ select
       (select count(*)::int from public.groups where id = (select id from g where name = 'class')),
       (select count(*)::int from public.search_groups('mix class')) $$,
  $$ values (0, 0) $$,
  'a banned owner''s group has no card and is not in search'
);
reset role;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select throws_ok(
  $$ select public.ask_to_join((select id from g where name = 'class')) $$,
  'P0002', 'not_found', 'and nobody can ask to join it'
);
reset role;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select is(
  (select count(*)::int from public.groups where id = (select id from g where name = 'class')),
  1,
  'its members still have it'
);
reset role;
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select throws_ok(
  $$ select public.remove_member((select id from g where name = 'class'), '22222222-2222-4222-8222-222222222222') $$,
  '42501', 'not_allowed', 'and a banned owner no longer runs it'
);
reset role;
update public.profiles set banned_at = null where handle = 'frank';

-- Songs in the group ---------------------------------------------------------------
insert into t values
  ('bob_song', pg_temp.make_group_track('22222222-2222-4222-8222-222222222222', (select id from g where name = 'class'), 'Secret zebra song')),
  ('bob_extra', pg_temp.make_group_track('22222222-2222-4222-8222-222222222222', (select id from g where name = 'class'), 'Extra take')),
  ('erin_song', pg_temp.make_group_track('55555555-5555-4555-8555-555555555555', (select id from g where name = 'class'), 'Erin draft')),
  ('carol_public', pg_temp.make_track('33333333-3333-4333-8333-333333333333'));
update public.tracks set tags = array['zebra'] where id = (select id from t where name = 'bob_song');
create temp table ts as select t.name, tr.slug from t join public.tracks tr on tr.id = t.id;
grant select on ts to anon, authenticated;
select throws_ok(
  $$ select pg_temp.make_group_track('33333333-3333-4333-8333-333333333333', (select id from g where name = 'class'), 'Let me in') $$,
  '42501', 'not_in_group', 'nobody posts to a group they are not in'
);
select throws_ok(
  $$ update public.tracks set group_id = null where id = (select id from t where name = 'bob_song') $$,
  '42501', 'not_allowed', 'a song never leaves its group for the feed'
);
select throws_ok(
  $$ update public.tracks set group_id = (select id from g where name = 'class') where id = (select id from t where name = 'carol_public') $$,
  '42501', 'not_allowed', 'and a feed song never moves into a group'
);

-- Activity in the group, then on carol's song in the feed.
select pg_temp.as_server();
insert into public.comments (track_id, author_id, body)
values ((select id from t where name = 'bob_song'), '55555555-5555-4555-8555-555555555555', 'Erin on zebra');
select pg_temp.as_server();
insert into public.comments (track_id, author_id, body)
values ((select id from t where name = 'bob_song'), '55555555-5555-4555-8555-555555555555', 'Erin second');
select pg_temp.as_server();
insert into public.comments (track_id, author_id, body)
values ((select id from t where name = 'erin_song'), '22222222-2222-4222-8222-222222222222', 'Bob on erin');
insert into storage.objects (bucket_id, name, owner_id)
select 'peaks', peaks_key, owner_id::text from public.tracks where id = (select id from t where name = 'bob_song');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
update public.comments set is_helpful = true where body = 'Erin on zebra';
reset role;
select pg_temp.as_user('55555555-5555-4555-8555-555555555555');
set local role authenticated;
insert into public.reactions (track_id, kind) values ((select id from t where name = 'bob_song'), 'fire');
reset role;
select is(
  (select count(*)::int from public.badges where user_id = '55555555-5555-4555-8555-555555555555'),
  0,
  'the first comment on a song in a group earns no badge'
);
select pg_temp.make_objects('22222222-2222-4222-8222-222222222222', 'f0000000-0000-4000-8000-000000000031');
select pg_temp.as_server();
insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms)
select (select id from t where name = 'bob_song'), 0,
  '22222222-2222-4222-8222-222222222222/f0000000-0000-4000-8000-000000000031.mp3',
  '22222222-2222-4222-8222-222222222222/f0000000-0000-4000-8000-000000000031.json', 30000;
select is(
  (select count(*)::int from public.badges where user_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'and nor does a new version after feedback in a group'
);
select pg_temp.as_server();
insert into public.comments (track_id, author_id, body)
values ((select id from t where name = 'carol_public'), '55555555-5555-4555-8555-555555555555', 'Erin in the feed');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
update public.comments set is_helpful = true where body = 'Erin in the feed';
reset role;

-- Nothing in the group counts outside it ----------------------------------------------
select results_eq(
  $$ select
       (select reputation from public.profiles where handle = 'erin'),
       (select comments_given from public.profile_stats('55555555-5555-4555-8555-555555555555')),
       (select helpful_received from public.profile_stats('55555555-5555-4555-8555-555555555555')),
       (select helpful from public.weekly_helpful_leaders() where handle = 'erin') $$,
  $$ values (1, 1, 1, 1) $$,
  'Helpful and comments in the group count nowhere: reputation, profile numbers and the weekly list have only the feed'
);
select is(
  (select array_agg(badge::text) from public.badges where user_id = '55555555-5555-4555-8555-555555555555'),
  array['first_ears'],
  'a first comment in the feed still earns its badge'
);

-- Nobody outside sees anything -----------------------------------------------------
create function pg_temp.sees_group()
returns integer
language sql
as $$
  select
    (select count(*) from public.tracks where group_id is not null)
    + (select count(*) from public.track_versions v join t on t.id = v.track_id where t.name <> 'carol_public')
    + (select count(*) from public.comments c join t on t.id = c.track_id where t.name <> 'carol_public')
    + (select count(*) from storage.objects o
       where o.bucket_id = 'peaks' and o.name like '22222222-2222-4222-8222-222222222222/%')
    + (select count(*) from public.group_members)
    + (select count(*) from public.feed_latest(p_page_size => 50) f where f.group_id is not null)
    + (select count(*) from public.feed_trending(p_page_size => 50) f where f.group_id is not null)
    + (select count(*) from public.feed_needs_ears(p_page_size => 50) f where f.group_id is not null)
    + (select count(*) from public.search('zebra') where kind = 'track')
    + (select count(*) from public.search('erin draft') where kind = 'track');
$$;
grant execute on function pg_temp.sees_group() to anon, authenticated;

select pg_temp.as_anon();
set local role anon;
select is(pg_temp.sees_group(), 0, 'signed out: no songs, versions, comments, peaks, members, feeds or search');
select results_eq(
  $$ select
       public.is_group_track((select slug from ts where name = 'bob_song')),
       public.is_group_track((select slug from ts where name = 'carol_public')),
       public.is_group_track('no-such-track-1234') $$,
  $$ values (true, false, false) $$,
  'the track page can tell a group track from nothing, and learns only that'
);
reset role;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select is(pg_temp.sees_group(), 0, 'someone outside: the same');
select throws_ok(
  $$ insert into public.comments (track_id, body) values ((select id from t where name = 'bob_song'), 'Let me in') $$,
  '42501', null, 'they cannot comment'
);
select throws_ok(
  $$ insert into public.reactions (track_id, kind) values ((select id from t where name = 'bob_song'), 'fire') $$,
  '42501', null, 'or react'
);
select throws_ok(
  $$ insert into public.comments (track_id, body, time_ms) values ((select id from t where name = 'bob_song'), 'x', 999999999) $$,
  '42501', 'not_allowed', 'a comment far past the end answers like a missing track, so the length stays hidden'
);
select throws_ok(
  $$ insert into public.reports (target_type, track_id, reason) values ('track', (select id from t where name = 'bob_song'), 'spam') $$,
  '42501', null, 'or report what they cannot see'
);
reset role;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select is(pg_temp.sees_group(), 0, 'someone who asked and heard no: the same');
reset role;
set local role service_role;
select throws_ok(
  $$ select public.record_play((select id from t where name = 'bob_song'), 'listener-x', '33333333-3333-4333-8333-333333333333') $$,
  '22023', 'not_found', 'a play from outside is refused'
);
select throws_ok(
  $$ select public.record_play((select id from t where name = 'bob_song'), 'listener-y', null) $$,
  '22023', 'not_found', 'and from someone signed out'
);
select ok(
  public.record_play((select id from t where name = 'bob_song'), 'listener-z', '55555555-5555-4555-8555-555555555555'),
  'a member''s play counts in the group'
);
reset role;

-- Members see it all, and still nothing of it outside the group ----------------------
select pg_temp.as_user('55555555-5555-4555-8555-555555555555');
set local role authenticated;
select results_eq(
  $$ select
       (select count(*)::int from public.tracks where group_id = (select id from g where name = 'class')),
       (select count(*)::int from public.track_versions where track_id = (select id from t where name = 'bob_song')),
       (select count(*)::int from public.comments where track_id = (select id from t where name = 'bob_song')),
       (select count(*)::int from storage.objects o where o.bucket_id = 'peaks'
          and o.name = (select peaks_key from public.tracks tr where tr.id = (select id from t where name = 'bob_song'))),
       (select count(*)::int from public.group_members where group_id = (select id from g where name = 'class')) $$,
  $$ values (3, 2, 2, 1, 3) $$,
  'a member sees the songs, versions, comments, peaks and who is in the group'
);
select results_eq(
  $$ select
       (select count(*)::int from public.feed_latest(p_page_size => 50) f where f.group_id is not null),
       (select count(*)::int from public.feed_trending(p_page_size => 50) f where f.group_id is not null),
       (select count(*)::int from public.feed_needs_ears(p_page_size => 50) f where f.group_id is not null),
       (select count(*)::int from public.search('zebra') where kind = 'track') $$,
  $$ values (0, 0, 0, 0) $$,
  'the feeds and search stay without group songs, also for members'
);
select is(
  public.is_group_track((select slug from ts where name = 'bob_song')),
  false,
  'for a member the track is simply there'
);
reset role;

-- Admins and group content -----------------------------------------------------------
select pg_temp.as_server();
insert into public.reports (reporter_id, target_type, comment_id, reason)
values ('22222222-2222-4222-8222-222222222222', 'comment',
  (select id from public.comments where body = 'Erin on zebra'), 'spam');
select ok(
  (select in_group from public.reports where reported_text = 'Erin on zebra'),
  'a report about group content is marked so'
);
create temp table erin_comment as select id from public.comments where body = 'Erin on zebra';
grant select on erin_comment to authenticated;
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
set local role authenticated;
select results_eq(
  $$ select
       (select count(*)::int from public.tracks where id = (select id from t where name = 'bob_song')),
       (select count(*)::int from public.comments where track_id = (select id from t where name = 'bob_song')),
       (select count(*)::int from public.reports where comment_id = (select id from erin_comment)) $$,
  $$ values (0, 0, 0) $$,
  'an admin sees no group song, comment or report about it'
);
select is(
  (select count(*)::int from public.admin_closed_reports() where track_id = (select id from t where name = 'bob_song')),
  1,
  'but is told there is a report on group content'
);
select throws_ok(
  $$ select public.admin_set_track_status((select id from t where name = 'bob_song'), 'hidden', null) $$,
  '42501', 'closed_needs_access', 'and cannot act on it before opening it'
);
select throws_ok(
  $$ select public.delete_comment((select id from erin_comment)) $$,
  '42501', 'closed_needs_access', 'not delete a comment in it, even knowing its id'
);
select throws_ok(
  $$ select public.admin_resolve_report(
       (select r.report_id from public.admin_closed_reports() r where r.track_id = (select id from t where name = 'bob_song')),
       'dismissed', null) $$,
  '42501', 'closed_needs_access', 'and not decide its report'
);
select throws_ok(
  $$ select public.admin_open_closed((select id from t where name = 'bob_song'), 'legal', null, 'short') $$,
  '22023', 'note_required', 'a legal request needs a note'
);
select throws_ok(
  $$ select public.admin_open_closed((select id from t where name = 'bob_song'), 'report', gen_random_uuid(), '') $$,
  '22023', 'no_such_report', 'a report reason needs a report about this track'
);
create temp table opened as
select public.admin_open_closed((select id from t where name = 'bob_song'), 'report',
  (select r.report_id from public.admin_closed_reports() r where r.track_id = (select id from t where name = 'bob_song')), '')
  as until;
select ok(
  (select until between now() + interval '23 hours' and now() + interval '25 hours' from opened),
  'opening it for the report gives 24 hours'
);
select results_eq(
  $$ select
       (select count(*)::int from public.tracks where id = (select id from t where name = 'bob_song')),
       (select count(*)::int from public.comments where track_id = (select id from t where name = 'bob_song')),
       (select count(*)::int from public.reports where comment_id = (select id from erin_comment)) $$,
  $$ values (1, 2, 1) $$,
  'then the admin sees the song, its comments and the report'
);
select throws_ok(
  $$ insert into public.comments (track_id, body) values ((select id from t where name = 'bob_song'), 'Admin here') $$,
  '42501', 'not_allowed', 'opening is for reading: the admin does not comment in the group'
);
select lives_ok(
  $$ select public.admin_set_comment_status((select id from erin_comment), 'hidden', null) $$,
  'and can act on it'
);
select public.admin_set_comment_status((select id from public.comments where body = 'Erin second'), 'live', null);
reset role;
select results_eq(
  $$ select admin_id, reason, comment_id is not null, report_id is not null, outcome, decided_at is not null
     from private.admin_access where track_id = (select id from t where name = 'bob_song') $$,
  $$ values ('44444444-4444-4444-8444-444444444444'::uuid, 'report', true, true, 'hidden', true) $$,
  'the opening is logged: who, which track and comment, which report, and what came of it (the strictest decision stands)'
);
update private.admin_access set expires_at = now() - interval '1 minute';
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
set local role authenticated;
select is(
  (select count(*)::int from public.tracks where id = (select id from t where name = 'bob_song')),
  0,
  'after 24 hours it is closed to the admin again'
);
reset role;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok(
  $$ select public.admin_open_closed((select id from t where name = 'bob_song'), 'legal', null, 'a long enough note') $$,
  '42501', 'not_allowed', 'only admins open group content'
);
reset role;
select ok(
  not exists (
    select 1 from pg_policies where tablename in ('tracks', 'comments', 'reports')
      and qual like '%is_admin%' and qual not like '%can_see%'
  ),
  'no admin policy covers group content without the check'
);
update public.reports set status = 'resolved', resolved_at = now() where reported_text = 'Erin on zebra';

-- Leaving: your songs and comments stay ------------------------------------------------
select private.notify_moderation('55555555-5555-4555-8555-555555555555', 'hidden', 'track',
  (select id from t where name = 'erin_song'), null, null);
select pg_temp.as_user('55555555-5555-4555-8555-555555555555');
set local role authenticated;
select lives_ok($$ select public.leave_group((select id from g where name = 'class')) $$, 'erin leaves');
reset role;
select is(
  (select count(*)::int from public.notifications
   where user_id = '55555555-5555-4555-8555-555555555555' and kind = 'moderation'),
  2,
  'notices about moderation of her own posts stay (her hidden comment, her track)'
);
select results_eq(
  $$ select
       (select group_id from public.tracks where id = (select id from t where name = 'erin_song')),
       (select members_count from public.groups where id = (select id from g where name = 'class')),
       (select count(*)::int from public.notifications where user_id = '55555555-5555-4555-8555-555555555555'
          and group_id is not null) $$,
  $$ select (select id from g where name = 'class'), 2, 0 $$,
  'her song stays in the group, the count follows, and her group notices go'
);
select pg_temp.as_user('55555555-5555-4555-8555-555555555555');
set local role authenticated;
select results_eq(
  $$ select
       (select count(*)::int from public.tracks where id = (select id from t where name = 'erin_song')),
       (select count(*)::int from public.track_versions where track_id = (select id from t where name = 'erin_song')),
       (select count(*)::int from public.comments where track_id = (select id from t where name = 'erin_song')),
       (select count(*)::int from public.tracks where id = (select id from t where name = 'bob_song')) $$,
  $$ values (1, 0, 0, 0) $$,
  'she still finds her song in her own list, but cannot hear it or read its comments, or see the rest'
);
select results_eq(
  $$ select title, group_name, is_member from public.my_group_tracks() $$,
  $$ values ('Erin draft', 'Mix class H26', false) $$,
  'her list of group tracks says she is no longer in the group'
);
select is(
  public.is_group_track((select slug from ts where name = 'bob_song')),
  true,
  'and the other tracks there are for members again'
);
select results_eq(
  $$ select owner_id, status::text from public.tracks where id = (select id from t where name = 'erin_song') $$,
  $$ values ('55555555-5555-4555-8555-555555555555'::uuid, 'live') $$,
  'which is what deleting it needs'
);
select throws_ok(
  $$ insert into public.comments (track_id, body) values ((select id from t where name = 'erin_song'), 'Still here?') $$,
  '42501', null, 'she no longer comments there'
);
update public.comments set body = 'Erin edits after leaving' where body = 'Erin second';
update public.tracks set title = 'Renamed after leaving' where id = (select id from t where name = 'erin_song');
reset role;
select results_eq(
  $$ select
       (select count(*)::int from public.comments where body = 'Erin second'),
       (select title from public.tracks where id = (select id from t where name = 'erin_song')) $$,
  $$ values (1, 'Erin draft') $$,
  'or edits her comments or her song there'
);
select pg_temp.make_objects('55555555-5555-4555-8555-555555555555', 'f0000000-0000-4000-8000-000000000032');
select pg_temp.as_server();
select throws_ok(
  $$ insert into public.track_versions (track_id, version_no, audio_key, peaks_key, duration_ms)
     select (select id from t where name = 'erin_song'), 0,
       '55555555-5555-4555-8555-555555555555/f0000000-0000-4000-8000-000000000032.mp3',
       '55555555-5555-4555-8555-555555555555/f0000000-0000-4000-8000-000000000032.json', 30000 $$,
  '42501', 'not_in_group', 'or adds a version'
);
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select results_eq(
  $$ select
       (select count(*)::int from public.tracks where id = (select id from t where name = 'erin_song')),
       (select count(*)::int from public.comments where body = 'Erin second') $$,
  $$ values (1, 1) $$,
  'the members still have her song and her comments'
);
reset role;
select pg_temp.as_server();
insert into public.comments (track_id, author_id, parent_id, body)
values ((select id from t where name = 'bob_song'), '22222222-2222-4222-8222-222222222222',
  (select id from public.comments where body = 'Erin second'), 'Bob replies to erin');
select is(
  (select count(*)::int from public.notifications
   where user_id = '55555555-5555-4555-8555-555555555555' and kind = 'reply'),
  0,
  'a former member gets no notice about a group song'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = '55555555-5555-4555-8555-555555555555' and kind = 'comment'),
  0,
  'not even about comments on her own song there'
);

-- The owner keeps the group in order -----------------------------------------------------
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok(
  $$ select * from public.remove_track_from_group((select id from t where name = 'erin_song')) $$,
  'P0002', 'not_found', 'only the group owner removes songs'
);
select throws_ok(
  $$ select public.delete_comment((select id from public.comments where body = 'Erin second')) $$,
  'P0002', 'not_found', 'a member cannot delete someone else''s comment'
);
reset role;
update public.tracks set status = 'hidden' where id = (select id from t where name = 'bob_extra');
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select is(
  (select count(*)::int from public.remove_track_from_group((select id from t where name = 'bob_extra'))),
  1,
  'the owner removes a track, also one moderation hid, and gets its files to remove'
);
reset role;
select is(
  (select count(*)::int from public.tracks where id = (select id from t where name = 'bob_extra')),
  0,
  'a removed song is deleted, for its uploader too'
);
select pg_temp.as_server();
insert into public.reports (reporter_id, target_type, comment_id, reason)
values ('66666666-6666-4666-8666-666666666666', 'comment',
  (select id from public.comments where body = 'Bob on erin'), 'harassment');
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select is(
  public.delete_comment((select id from public.comments where body = 'Bob on erin')),
  'deleted',
  'the owner deletes a comment in the group, also a reported one'
);
select is(
  public.delete_comment((select id from public.comments where body = 'Erin second')),
  'withdrawn',
  'one with replies is withdrawn, as its author would'
);
reset role;
select pg_temp.as_server();
insert into public.reports (reporter_id, target_type, track_id, reason)
values ('22222222-2222-4222-8222-222222222222', 'track', (select id from t where name = 'erin_song'), 'spam');
select ok(
  public.track_under_review((select id from t where name = 'erin_song')),
  'a reported track is under review, so its uploader cannot delete it'
);
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select lives_ok(
  $$ select * from public.remove_track_from_group((select id from t where name = 'erin_song')) $$,
  'but the group''s owner removes it at once'
);
reset role;
select results_eq(
  $$ select reporter_id, reason::text, status::text, removed_by_group_owner, resolved_by,
       resolved_at is not null, reported_text, track_id
     from public.reports where in_group and target_type = 'track' $$,
  $$ values ('22222222-2222-4222-8222-222222222222'::uuid, 'spam', 'resolved', true,
       '66666666-6666-4666-8666-666666666666'::uuid, true, '', null::uuid) $$,
  'its report stays as a record, settled as removed by the group''s owner, without the content'
);
select results_eq(
  $$ select status::text, removed_by_group_owner from public.reports where reason = 'harassment' $$,
  $$ values ('resolved', true) $$,
  'and so does the report on the comment'
);
select pg_temp.as_server();
insert into public.reports (reporter_id, target_type, comment_id, reason)
values ('66666666-6666-4666-8666-666666666666', 'comment',
  (select id from public.comments where body = 'Bob replies to erin'), 'other');

-- Removed: songs stay, no way back.
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select lives_ok(
  $$ select public.remove_member((select id from g where name = 'class'), '22222222-2222-4222-8222-222222222222') $$,
  'the owner removes a member'
);
select throws_ok(
  $$ select public.leave_group((select id from g where name = 'class')) $$,
  '22023', 'owner_cannot_leave', 'the owner cannot leave'
);
reset role;
select is(
  (select group_id from public.tracks where id = (select id from t where name = 'bob_song')),
  (select id from g where name = 'class'),
  'a removed member''s song stays in the group'
);
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok(
  $$ select public.ask_to_join((select id from g where name = 'class')) $$,
  '42501', 'removed_from_group', 'and someone removed cannot ask again'
);
select results_eq(
  $$ select is_member, removed from public.group_status((select id from g where name = 'class')) $$,
  $$ values (false, true) $$,
  'which their card says'
);
select is(
  (select group_name from public.my_group_removals()),
  'Mix class H26',
  'and their data export'
);
reset role;

-- Deleting the group deletes its songs -------------------------------------------------
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok(
  $$ select * from public.delete_group((select id from g where name = 'class')) $$,
  'P0002', 'not_found', 'only the owner deletes a group'
);
reset role;
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
set local role authenticated;
create temp table deleted_files as
select * from public.delete_group((select id from g where name = 'class'));
reset role;
select ok(
  (select count(*) from deleted_files) >= 2
    and exists (select 1 from deleted_files where peaks_key like '22222222-2222-4222-8222-222222222222/%'),
  'the owner deletes the group and gets every song''s files to remove'
);
select results_eq(
  $$ select
       (select count(*)::int from public.groups where id = (select id from g where name = 'class')),
       (select count(*)::int from public.tracks where id in (select id from t where name <> 'carol_public')),
       (select count(*)::int from public.comments where body like 'Erin on%' or body like 'Bob %'),
       (select count(*)::int from public.notifications where group_id is not null),
       (select count(*)::int from public.reports where in_group and track_id is null and comment_id is null),
       (select count(*)::int from public.reports where in_group and status = 'open') $$,
  $$ values (0, 0, 0, 0, 4, 0) $$,
  'the group, its tracks, their comments and its notices are gone; the reports about them stay, none left open'
);
select is(
  (select count(*)::int from public.reports where in_group and reported_text <> ''),
  0,
  'and keep no copy of what nobody can open any more'
);
select is(
  (select count(*)::int from public.unused_audio_keys(array(select audio_key from deleted_files))),
  (select count(distinct audio_key)::int from deleted_files),
  'and the daily cleanup would remove the audio if the caller did not'
);

-- An owner deleting their account deletes their group and its songs.
delete from private.rate_limit_events where action = 'group_create';
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set local role authenticated;
insert into g (name, id, slug) select 'band', id, slug from public.create_group('Band');
reset role;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select public.ask_to_join((select id from g where name = 'band'));
reset role;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select public.answer_ask((select id from g where name = 'band'), '33333333-3333-4333-8333-333333333333', true);
reset role;
insert into t values
  ('band_song', pg_temp.make_group_track('33333333-3333-4333-8333-333333333333', (select id from g where name = 'band'), 'Band song'));
select pg_temp.as_server();
insert into public.comments (track_id, author_id, body)
values ((select id from t where name = 'band_song'), '11111111-1111-4111-8111-111111111111', 'Alice on the band song');
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$ select
       (select count(*)::int from public.groups where id = (select id from g where name = 'band')),
       (select count(*)::int from public.tracks where id = (select id from t where name = 'band_song')),
       (select count(*)::int from public.tracks where id = (select id from t where name = 'carol_public')) $$,
  $$ values (0, 0, 1) $$,
  'an owner deleting their account deletes the group and the songs in it, and nothing else'
);

-- What is kept, and for how long -------------------------------------------------------
select private.purge_expired_data();
select is((select count(*)::int from private.admin_access), 1, 'openings are kept');
update private.admin_access set created_at = now() - interval '13 months';
select private.purge_expired_data();
select is((select count(*)::int from private.admin_access), 0, 'for 12 months');
update public.reports set status = 'resolved', resolved_at = now() - interval '13 months'
where in_group and target_type = 'comment';
insert into public.reports (reporter_id, target_type, reason)
values ('33333333-3333-4333-8333-333333333333', 'track', 'spam');
update public.reports set reported_text = 'Old copy', created_at = now() - interval '13 months'
where reporter_id = '33333333-3333-4333-8333-333333333333' and not in_group;
select private.purge_expired_data();
select results_eq(
  $$ select
       (select count(*)::int from public.reports where in_group and resolved_at < now() - interval '12 months'),
       (select reported_text from public.reports where reason = 'spam' and created_at < now() - interval '12 months'
          and reporter_id = '33333333-3333-4333-8333-333333333333') $$,
  $$ values (3, '') $$,
  'reports stay as a record; a copy of deleted content goes 12 months after the decision, or after it was made when never decided'
);
insert into public.groups (slug, name, owner_id) values ('kept', 'Kept', '33333333-3333-4333-8333-333333333333');
insert into public.group_join_requests (group_id, user_id, status, decided_at)
values ((select id from public.groups where slug = 'kept'), '22222222-2222-4222-8222-222222222222', 'declined', now() - interval '8 days');
select private.purge_expired_data();
select is((select count(*)::int from public.group_join_requests), 0, 'a no is forgotten after 7 days');

-- Grants ----------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.create_group(text)', 'execute')
    and not has_function_privilege('anon', 'public.ask_to_join(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.delete_group(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.my_groups()', 'execute')
    and not has_function_privilege('anon', 'public.my_group_tracks()', 'execute')
    and not has_function_privilege('anon', 'public.admin_open_closed(uuid, text, uuid, text)', 'execute')
    and not has_table_privilege('authenticated', 'public.groups', 'insert')
    and not has_table_privilege('authenticated', 'public.group_members', 'insert')
    and not has_table_privilege('authenticated', 'public.group_join_requests', 'insert')
    and not has_column_privilege('authenticated', 'public.group_join_requests', 'status', 'select')
    and not has_column_privilege('authenticated', 'public.tracks', 'group_id', 'update')
    and not has_schema_privilege('authenticated', 'private', 'usage'),
  'groups, members and asks change only through the functions'
);
select ok(
  has_function_privilege('anon', 'access.can_see_track(uuid)', 'execute')
    and not has_function_privilege('anon', 'private.can_see_track(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'private.delete_group_track(uuid)', 'execute'),
  'policies ask only for the visitor themself'
);

select * from finish();
rollback;
