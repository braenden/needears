-- Audio in R2: who gets a playback URL (the audio keys a visitor can read
-- in track_versions), verified uploads and the cleanup of unused audio.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
\ir _helpers.psql

create temp table t as
select
  pg_temp.make_track('11111111-1111-4111-8111-111111111111') as live,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'hidden') as hidden,
  pg_temp.make_track('11111111-1111-4111-8111-111111111111', 'deleted') as deleted;
grant select on t to anon, authenticated, service_role;

create temp table keys as
select v.audio_key, tr.status
from public.track_versions v
join public.tracks tr on tr.id = v.track_id
where tr.id in (select live from t union select hidden from t union select deleted from t);
grant select on keys to anon, authenticated;

-- Who gets a URL -------------------------------------------------------------
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select results_eq(
  $$ select k.status::text from public.track_versions v join keys k using (audio_key) $$,
  $$ values ('live') $$,
  'signed out visitors only get the audio of live tracks'
);
reset role;

select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$ select k.status::text from public.track_versions v join keys k using (audio_key) $$,
  $$ values ('live') $$,
  'other users only get the audio of live tracks'
);
reset role;

select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.track_versions v join keys k using (audio_key)),
  3,
  'the owner can still play their hidden and taken down tracks'
);
reset role;

select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.track_versions v join keys k using (audio_key)),
  3,
  'admins can play hidden and taken down tracks'
);
reset role;

update public.tracks set status = 'hidden' where id = (select live from t);
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is(
  (select count(*)::int from public.track_versions v join keys k using (audio_key)),
  0,
  'after a track is hidden nobody signed out gets its audio'
);
reset role;

-- Verified uploads -----------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.mark_upload_verified(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.mark_upload_verified(uuid, uuid)', 'execute'),
  'only the service role can mark an upload verified'
);
select ok(
  not has_function_privilege('authenticated', 'public.discard_upload(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.discard_upload(uuid, uuid)', 'execute'),
  'only the service role can discard an upload'
);
select ok(
  not has_function_privilege('authenticated', 'public.unused_audio_keys(text[])', 'execute')
    and not has_function_privilege('anon', 'public.unused_audio_keys(text[])', 'execute'),
  'only the service role can list unused audio'
);

select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'd0000000-0000-4000-8000-000000000001', false);
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'd0000000-0000-4000-8000-000000000002', false);
update private.upload_reservations set expires_at = now() - interval '1 minute'
where object_id = 'd0000000-0000-4000-8000-000000000002';

set local role service_role;
select ok(
  not public.mark_upload_verified('22222222-2222-4222-8222-222222222222', 'd0000000-0000-4000-8000-000000000001'),
  'an upload cannot be verified for someone else'
);
select ok(
  not public.mark_upload_verified('33333333-3333-4333-8333-333333333333', 'd0000000-0000-4000-8000-000000000002'),
  'an expired upload cannot be verified'
);
select throws_ok(
  $$ insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key)
     values ('33333333-3333-4333-8333-333333333333', 'Unchecked', 1, 5000,
       '33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000001.mp3',
       '33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000001.json') $$,
  '22023', 'audio_not_verified', 'a track cannot use audio that was not verified'
);
select ok(
  public.mark_upload_verified('33333333-3333-4333-8333-333333333333', 'd0000000-0000-4000-8000-000000000001'),
  'the service role marks a valid upload verified'
);
select lives_ok(
  $$ insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key)
     values ('33333333-3333-4333-8333-333333333333', 'Checked', 1, 5000,
       '33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000001.mp3',
       '33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000001.json') $$,
  'then the track can be created'
);

-- A rejected upload is discarded before its files go, and can then not be
-- used; the reservation of a track that exists can no longer be discarded.
reset role;
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'd0000000-0000-4000-8000-000000000004');
set local role service_role;
select ok(
  public.discard_upload('33333333-3333-4333-8333-333333333333', 'd0000000-0000-4000-8000-000000000004')
    and not public.discard_upload('33333333-3333-4333-8333-333333333333', 'd0000000-0000-4000-8000-000000000001'),
  'a rejected upload is discarded, a used one is not'
);
select throws_ok(
  $$ insert into public.tracks (owner_id, title, genre_id, duration_ms, audio_key, peaks_key)
     values ('33333333-3333-4333-8333-333333333333', 'Discarded', 1, 5000,
       '33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000004.mp3',
       '33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000004.json') $$,
  '22023', 'audio_not_verified', 'a discarded upload cannot become a track'
);
reset role;

-- Cleanup --------------------------------------------------------------------
select pg_temp.make_objects('33333333-3333-4333-8333-333333333333', 'd0000000-0000-4000-8000-000000000003', false);
set local role service_role;
select results_eq(
  $$ select k from public.unused_audio_keys(array[
       (select audio_key from public.tracks where id = (select hidden from t)),
       '33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000001.mp3',
       '33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000002.mp3',
       '33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000003.mp3',
       'not-a-key.mp3'
     ]) as k order by k $$,
  $$ values ('33333333-3333-4333-8333-333333333333/d0000000-0000-4000-8000-000000000002.mp3'),
            ('not-a-key.mp3') $$,
  'cleanup removes audio no track uses and no valid reservation covers'
);
reset role;

select * from finish();
rollback;
