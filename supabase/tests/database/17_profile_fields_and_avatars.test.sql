-- Profile links, working on, DAW, and uploaded profile pictures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);
\ir _helpers.psql

-- Links ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ update public.profiles
     set links = '[{"label": " SoundCloud ", "url": "https://soundcloud.com/alice"},
                   {"label": "Bandcamp", "url": "https://alice.bandcamp.com/album/one"}]',
         working_on = '  A lo-fi EP  ', daw = ' Ableton Live '
     where id = '11111111-1111-4111-8111-111111111111' $$,
  'users can set links on allowed hosts, working on and DAW'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "Site", "url": "https://alice.example.com"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'other hosts are rejected'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "SC", "url": "http://soundcloud.com/alice"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'plain http is rejected'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "SC", "url": "https://soundcloud.com.evil.com/"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'a lookalike host is rejected'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "SC", "url": "HTTPS://SOUNDCLOUD.COM/alice"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'the host must be lower case, as in the form'
);
select throws_ok(
  $$ update public.profiles set links = jsonb_build_array(jsonb_build_object('label', 'SC' || chr(8238), 'url', 'https://soundcloud.com/alice'))
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'text direction marks are rejected'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "FB", "url": "https://l.facebook.com/l.php?u=https://evil.example"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'redirect subdomains are rejected'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "Twitch", "url": "https://id.twitch.tv/oauth2/authorize"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'sign in subdomains are rejected'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "YT", "url": "https://www.youtube.com/redirect?q=https://evil.example"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'redirect paths are rejected'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "X", "url": "https://.x.com/"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'empty host labels are rejected'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "SC", "url": "https://x@soundcloud.com/"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'user info in the URL is rejected'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label": "SC", "url": "https://soundcloud.com/", "onclick": "x"}]'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'extra keys are rejected'
);
select throws_ok(
  $$ update public.profiles set links = (
       select jsonb_agg(jsonb_build_object('label', 'L' || i, 'url', 'https://soundcloud.com/' || i))
       from generate_series(1, 6) i)
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'invalid_link', 'at most five links'
);
select throws_ok(
  $$ update public.profiles set working_on = repeat('x', 121) where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514', null, 'working on is at most 120 characters'
);
select throws_ok(
  $$ update public.profiles set daw = repeat('x', 41) where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514', null, 'DAW is at most 40 characters'
);
update public.profiles set working_on = 'hacked' where id = '22222222-2222-4222-8222-222222222222';
reset role;

select results_eq(
  $$ select links, working_on, daw from public.profiles where handle = 'alice' $$,
  $$ values ('[{"label": "SoundCloud", "url": "https://soundcloud.com/alice"},
               {"label": "Bandcamp", "url": "https://alice.bandcamp.com/album/one"}]'::jsonb,
             'A lo-fi EP', 'Ableton Live') $$,
  'labels and text are trimmed'
);
select is((select working_on from public.profiles where handle = 'bob'), '', 'users cannot edit someone else''s profile fields');

-- Avatars --------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select ok(
  public.can_upload_avatar('11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'),
  'users can upload to their own folder'
);
select ok(
  not public.can_upload_avatar('22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'),
  'but not to someone else''s'
);
select ok(
  not public.can_upload_avatar('11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg'),
  'only jpg and webp names'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     select 'avatars', '11111111-1111-4111-8111-111111111111/' || gen_random_uuid() || '.webp',
       '11111111-1111-4111-8111-111111111111'
     from generate_series(1, 3) $$,
  'three files fit'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('avatars', '11111111-1111-4111-8111-111111111111/' || gen_random_uuid() || '.webp',
       '11111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'a fourth file is refused'
);
select throws_ok(
  $$ update public.profiles set avatar_key = null where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'users cannot set avatar_key directly (POST /api/profile/avatar does)'
);
reset role;

-- What the route does, as the service role.
update storage.objects set metadata = '{"size": 1000, "mimetype": "image/webp"}'
where bucket_id = 'avatars' and owner_id = '11111111-1111-4111-8111-111111111111';
set local role service_role;
select lives_ok(
  $$ update public.profiles
     set avatar_key = (select name from storage.objects
                       where bucket_id = 'avatars' and owner_id = '11111111-1111-4111-8111-111111111111'
                       order by name limit 1)
     where id = '11111111-1111-4111-8111-111111111111' $$,
  'avatar_key can point at the user''s own upload'
);
select throws_ok(
  $$ update public.profiles set avatar_key = '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'avatar_missing', 'avatar_key must point at an uploaded file'
);
select throws_ok(
  $$ update public.profiles set avatar_key = '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'avatar_missing', 'avatar_key must be in the user''s own folder'
);
reset role;

-- Someone else's file in alice's folder, and a file over the limit (as a
-- copy inside Storage would leave).
insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  ('avatars', '11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    '22222222-2222-4222-8222-222222222222', '{"size": 1000, "mimetype": "image/jpeg"}'),
  ('avatars', '11111111-1111-4111-8111-111111111111/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg',
    '11111111-1111-4111-8111-111111111111', '{"size": 26214400, "mimetype": "audio/mpeg"}');
set local role service_role;
select throws_ok(
  $$ update public.profiles set avatar_key = '11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'avatar_missing', 'avatar_key must be a file the user uploaded'
);
select throws_ok(
  $$ update public.profiles set avatar_key = '11111111-1111-4111-8111-111111111111/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '22023', 'avatar_missing', 'avatar_key must be an image within the bucket limits'
);
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  1,
  'anon can read current avatars only'
);
select ok((select count(*) from public.link_hosts) >= 6, 'the link hosts are public');
reset role;

-- Old unused files are cleaned up; the current one stays.
update storage.objects set created_at = now() - interval '4 hours' where bucket_id = 'avatars';
select is(
  (select count(*)::int from public.orphaned_upload_objects(500) o
   where o.bucket_id = 'avatars' and o.name like '11111111-%'),
  4,
  'cleanup finds the unused avatar files and skips the current one'
);

update public.profiles set banned_at = now() where handle = 'bob';
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select ok(
  not public.can_upload_avatar('22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
  'banned users cannot upload avatars'
);
select throws_ok(
  $$ update public.profiles set links = '[]', working_on = 'Spam' where id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', 'not_allowed', 'banned users cannot change their profile links or text'
);
reset role;

select * from finish();
rollback;
