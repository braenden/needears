-- Audio and peaks are private and follow the visibility of their track, so
-- hiding or taking down a track also cuts off its files.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
\ir _helpers.psql

create temp table t (name text primary key, id uuid, audio text, peaks text);
grant select on t to anon, authenticated;

insert into t (name, id) values
  ('live', pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'live')),
  ('hidden', pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'hidden')),
  ('deleted', pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'deleted'));
update t set audio = tr.audio_key, peaks = tr.peaks_key from public.tracks tr where tr.id = t.id;

insert into storage.objects (bucket_id, name, owner_id)
select 'audio', audio, '11111111-1111-4111-8111-111111111111' from t
union all
select 'peaks', peaks, '11111111-1111-4111-8111-111111111111' from t;
-- A file no track uses (an upload in progress).
insert into storage.objects (bucket_id, name, owner_id)
values ('audio', '11111111-1111-4111-8111-111111111111/' || gen_random_uuid() || '.mp3',
  '11111111-1111-4111-8111-111111111111');

select ok(
  not exists (select 1 from storage.buckets where id in ('audio', 'peaks') and public),
  'the audio and peaks buckets are private'
);

-- Anyone (signed out).
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is(
  (select count(*)::int from storage.objects where name in (select audio from t where name = 'live')
    or name in (select peaks from t where name = 'live')),
  2, 'anyone can read the audio and peaks of a live track'
);
select is(
  (select count(*)::int from storage.objects o join t on o.name in (t.audio, t.peaks) where t.name <> 'live'),
  0, 'nobody signed out can read files of hidden or taken down tracks'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'audio'
    and name like '11111111-1111-4111-8111-111111111111/%'
    and name not in (select audio from t)),
  0, 'files no track uses cannot be read'
);
reset role;

-- Another user.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from storage.objects o join t on o.name = t.audio where t.name = 'live'),
  1, 'a signed in user can read a live track'
);
select is(
  (select count(*)::int from storage.objects o join t on o.name in (t.audio, t.peaks) where t.name <> 'live'),
  0, 'another user cannot read files of hidden or taken down tracks'
);
reset role;

-- The owner.
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from storage.objects o join t on o.name in (t.audio, t.peaks) where t.name <> 'live'),
  4, 'the owner can still play their hidden and taken down tracks'
);
reset role;

-- An admin.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from storage.objects o join t on o.name in (t.audio, t.peaks) where t.name <> 'live'),
  4, 'admins can play hidden and taken down tracks'
);
reset role;

-- Hiding a live track cuts off access at once.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select public.admin_set_track_status((select id from t where name = 'live'), 'hidden');
reset role;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is(
  (select count(*)::int from storage.objects o join t on o.name in (t.audio, t.peaks) where t.name = 'live'),
  0, 'after an admin hides a track its files can no longer be read'
);
reset role;

-- Users still cannot change or remove audio or peaks (no update or delete
-- policy outside the avatars bucket, where only unused files can go).
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE', 'ALL')
      and policyname <> 'Users delete their unused avatar files'
  ),
  'users cannot change or delete stored files'
);

select * from finish();
rollback;
