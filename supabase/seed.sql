-- Local fixtures: 3 users, 10 tracks with audio and peaks, 30 comments.
-- Used by local development, the frontend session and Playwright.
--
-- Sign in locally with email and password (test values, local only):
--   nora@example.com   / password123   new uploader
--   jonas@example.com  / password123   regular
--   mia@example.com    / password123   admin
--
-- The audio and peaks objects come from supabase/seed-storage (uploaded by
-- the CLI from [storage.buckets.*] in config.toml). Seeding mode skips rate
-- limits and storage checks, and keeps the values written here.

select set_config('needears.seeding', 'on', false);

-- Users --------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now() - interval '60 days',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  jsonb_build_object('handle', u.handle, 'display_name', u.display_name, 'onboarded', true),
  now() - interval '60 days',
  now() - interval '60 days',
  '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'nora@example.com', 'nora', 'Nora'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'jonas@example.com', 'jonas', 'Jonas Berg'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'mia@example.com', 'mia', 'Mia K')
) as u (id, email, handle, display_name);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now() - interval '60 days',
  now() - interval '60 days',
  now() - interval '60 days'
from auth.users u
where u.id::text like 'a0000000-0000-4000-8000-%';

update public.profiles p
set bio = v.bio, role = v.role::public.user_role, created_at = now() - interval '60 days'
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'Bedroom producer, two months in. Be gentle, be honest.', 'user'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'Beatmaker from Bergen. Mostly hip hop and lo-fi.', 'user'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'Mix engineer. I will tell you about your low end.', 'admin')
) as v (id, bio, role)
where p.id = v.id;

-- Tracks -------------------------------------------------------------------

insert into public.tracks (
  id, slug, owner_id, title, description, genre_id, tags, feedback_wants, level,
  duration_ms, audio_key, peaks_key, published_at, created_at
)
select
  t.id,
  t.slug,
  t.owner_id,
  t.title,
  t.description,
  (select g.id from public.genres g where g.slug = t.genre),
  t.tags,
  t.wants::public.feedback_category[],
  t.level::public.track_level,
  t.seconds * 1000,
  t.owner_id::text || '/' || t.object_id || '.mp3',
  t.owner_id::text || '/' || t.object_id || '.json',
  now() - t.age,
  now() - t.age
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'first-light-demo-seed0001',
    'a0000000-0000-4000-8000-000000000001'::uuid, 'c0000000-0000-4000-8000-000000000001',
    'First light (demo)', 'My first finished idea. Does the drop work?', 'lo-fi',
    array['chill', 'piano'], array['vibe', 'arrangement'], 'beginner', 24, interval '2 hours'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'night-bus-seed0002',
    'a0000000-0000-4000-8000-000000000001'::uuid, 'c0000000-0000-4000-8000-000000000002',
    'Night bus', '', 'house',
    array['groove'], array['mix'], 'beginner', 18, interval '1 day'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'slow-tide-seed0003',
    'a0000000-0000-4000-8000-000000000001'::uuid, 'c0000000-0000-4000-8000-000000000003',
    'Slow tide', 'Ambient sketch, too long?', 'ambient',
    array[]::text[], array['vibe'], 'beginner', 30, interval '9 days'),
  ('b0000000-0000-4000-8000-000000000004'::uuid, 'brygge-beat-seed0004',
    'a0000000-0000-4000-8000-000000000002'::uuid, 'c0000000-0000-4000-8000-000000000004',
    'Brygge beat', 'Kick feels weak on laptop speakers.', 'hip-hop',
    array['boom bap', 'sample'], array['mix', 'sound_design'], 'intermediate', 20, interval '5 hours'),
  ('b0000000-0000-4000-8000-000000000005'::uuid, 'rain-on-the-roof-seed0005',
    'a0000000-0000-4000-8000-000000000002'::uuid, 'c0000000-0000-4000-8000-000000000005',
    'Rain on the roof', 'Vocals are a scratch take.', 'r-and-b',
    array['vocals'], array['vocals', 'mix'], 'intermediate', 26, interval '3 days'),
  ('b0000000-0000-4000-8000-000000000006'::uuid, 'fast-lane-seed0006',
    'a0000000-0000-4000-8000-000000000002'::uuid, 'c0000000-0000-4000-8000-000000000006',
    'Fast lane', '', 'drum-and-bass',
    array['liquid'], array['arrangement'], 'intermediate', 16, interval '6 days'),
  ('b0000000-0000-4000-8000-000000000007'::uuid, 'low-end-theory-seed0007',
    'a0000000-0000-4000-8000-000000000003'::uuid, 'c0000000-0000-4000-8000-000000000007',
    'Low end theory', 'Testing a new bass chain.', 'techno',
    array['bass', 'warehouse'], array['mix', 'sound_design'], 'advanced', 28, interval '30 minutes'),
  ('b0000000-0000-4000-8000-000000000008'::uuid, 'paper-boats-seed0008',
    'a0000000-0000-4000-8000-000000000003'::uuid, 'c0000000-0000-4000-8000-000000000008',
    'Paper boats', 'Singer-songwriter demo for a friend.', 'singer-songwriter',
    array['acoustic'], array['vocals', 'vibe'], 'advanced', 22, interval '2 days'),
  ('b0000000-0000-4000-8000-000000000009'::uuid, 'neon-steps-seed0009',
    'a0000000-0000-4000-8000-000000000003'::uuid, 'c0000000-0000-4000-8000-000000000009',
    'Neon steps', '', 'pop',
    array['synth'], array['arrangement', 'mix'], 'advanced', 19, interval '4 days'),
  ('b0000000-0000-4000-8000-000000000010'::uuid, 'old-tape-seed0010',
    'a0000000-0000-4000-8000-000000000003'::uuid, 'c0000000-0000-4000-8000-000000000010',
    'Old tape', 'Cassette saturation experiment.', 'experimental',
    array['tape', 'noise'], array['sound_design'], 'advanced', 25, interval '12 days')
) as t (id, slug, owner_id, object_id, title, description, genre, tags, wants, level, seconds, age);

-- Comments -----------------------------------------------------------------
-- n gives each comment a fixed id. Comments 29 and 30 are replies.
-- Night bus and Fast lane have one comment and Slow tide none, so the
-- Needs ears feed has something to show.

insert into public.comments (
  id, track_id, author_id, parent_id, time_ms, category, body, is_helpful, helpful_at, created_at
)
select
  ('d0000000-0000-4000-8000-0000000000' || lpad(c.n::text, 2, '0'))::uuid,
  ('b0000000-0000-4000-8000-0000000000' || lpad(c.track::text, 2, '0'))::uuid,
  ('a0000000-0000-4000-8000-00000000000' || c.author)::uuid,
  case when c.parent is not null
    then ('d0000000-0000-4000-8000-0000000000' || lpad(c.parent::text, 2, '0'))::uuid
  end,
  c.time_ms,
  c.category::public.feedback_category,
  c.body,
  c.helpful,
  case when c.helpful then now() - c.age + interval '10 minutes' end,
  now() - c.age
from (values
  (1, 1, 2, null, 5000, 'vibe', 'Love the mood here, the piano is lovely.', false, interval '1 hour'),
  (2, 1, 3, null, 12000, 'mix', 'The piano and the pad fight around 300 Hz. Try a small cut on the pad.', true, interval '90 minutes'),
  (3, 2, 2, null, 4000, 'arrangement', 'Intro could be 8 bars shorter.', true, interval '20 hours'),
  (4, 5, 3, null, null, 'mix', 'Hats are a bit harsh, a gentle shelf above 10k would help.', true, interval '18 hours'),
  (5, 10, 2, null, 15000, 'vibe', 'Perfect for late nights.', false, interval '8 days'),
  (6, 4, 3, null, 14000, 'sound_design', 'The reverb tail gets muddy here. Shorter decay or a high pass on the send.', true, interval '8 days'),
  (7, 4, 1, null, 2000, 'vibe', 'Fet beat!', false, interval '4 hours'),
  (8, 4, 3, null, 1000, 'mix', 'Kick has no click. Layer a short transient or boost around 3 to 4 kHz.', true, interval '3 hours'),
  (9, 4, 3, null, 9000, 'sound_design', 'Nice sample choice. Watch the phase between kick and bass.', true, interval '3 hours'),
  (10, 5, 1, null, 6000, 'vocals', 'The voice sounds very close, I like it.', false, interval '2 days'),
  (11, 5, 3, null, 11000, 'vocals', 'Sibilance on the s sounds, a de-esser around 6 kHz.', true, interval '2 days'),
  (12, 5, 3, null, 19000, 'mix', 'Vocal sits a bit low in the chorus.', false, interval '2 days'),
  (13, 9, 1, null, 3000, 'vibe', 'So much energy.', false, interval '5 days'),
  (14, 6, 3, null, 8000, 'arrangement', 'The break comes too early, let the groove ride for another 16.', true, interval '5 days'),
  (15, 7, 1, null, 4000, 'vibe', 'This bass is massive.', false, interval '20 minutes'),
  (16, 7, 2, null, 14000, 'sound_design', 'Distortion on the bass is great, maybe automate it into the drop.', true, interval '15 minutes'),
  (17, 8, 1, null, 7000, 'vocals', 'Gave me goosebumps.', false, interval '1 day'),
  (18, 8, 2, null, 13000, 'mix', 'Guitar is a little boomy, cut around 200 Hz.', true, interval '1 day'),
  (19, 8, 2, null, null, 'vibe', 'Lovely song overall.', false, interval '1 day'),
  (20, 9, 1, null, 2000, 'vibe', 'Catchy!', false, interval '3 days'),
  (21, 9, 2, null, 10000, 'arrangement', 'The second verse needs a new element to keep interest.', true, interval '3 days'),
  (22, 9, 2, null, 16000, 'mix', 'Synth lead is a bit loud compared to the drums.', false, interval '3 days'),
  (23, 10, 1, null, 5000, 'sound_design', 'What did you use for the tape sound?', false, interval '11 days'),
  (24, 10, 2, null, 12000, 'sound_design', 'Wow and flutter is subtle and nice. Try more on the pads only.', true, interval '11 days'),
  (25, 10, 2, null, 20000, 'mix', 'The noise floor gets loud at the end.', false, interval '10 days'),
  (26, 1, 3, null, 20000, 'arrangement', 'The ending stops abruptly, add a short tail.', false, interval '30 minutes'),
  (27, 7, 2, null, 24000, 'mix', 'Low end is mono, good. Sub could be 1 dB lower.', true, interval '10 minutes'),
  (28, 4, 1, null, 15000, 'vibe', 'Head nod guaranteed.', false, interval '2 hours'),
  (29, 4, 2, 8, null, 'mix', 'Thanks, will try a transient layer.', false, interval '2 hours'),
  (30, 10, 3, 23, null, 'sound_design', 'A cassette deck and a cheap plugin, nothing fancy.', false, interval '10 days')
) as c (n, track, author, parent, time_ms, category, body, helpful, age);

-- Reactions ----------------------------------------------------------------

insert into public.reactions (track_id, user_id, kind, created_at)
select
  ('b0000000-0000-4000-8000-0000000000' || lpad(r.track::text, 2, '0'))::uuid,
  ('a0000000-0000-4000-8000-00000000000' || r.usr)::uuid,
  r.kind::public.reaction_kind,
  now() - r.age
from (values
  (1, 2, 'heart', interval '1 hour'),
  (1, 3, 'headphones', interval '1 hour'),
  (4, 1, 'fire', interval '4 hours'),
  (4, 3, 'fire', interval '3 hours'),
  (5, 1, 'heart', interval '2 days'),
  (7, 1, 'fire', interval '20 minutes'),
  (7, 2, 'fire', interval '15 minutes'),
  (7, 2, 'headphones', interval '15 minutes'),
  (8, 1, 'heart', interval '1 day'),
  (9, 1, 'eyes', interval '3 days')
) as r (track, usr, kind, age);

select set_config('needears.seeding', 'off', false);
