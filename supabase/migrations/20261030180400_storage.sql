-- Storage buckets for audio and waveform peaks.
--
-- Both buckets are public: tracks are public in the feed, and public URLs go
-- through Supabase's CDN. The size and MIME limits are set on the bucket, so
-- a bug in the app cannot let a large or unexpected file through.
--
-- Only mp3 is stored (the browser encodes other formats). 15 minutes at
-- 192 kbps is about 21.6 MB, so 25 MiB leaves room for ID3 tags.
-- Keep these values in sync with [storage.buckets.*] in supabase/config.toml
-- and with src/lib/upload/limits.ts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio', 'audio', true, 26214400, array['audio/mpeg']),
  ('peaks', 'peaks', true, 262144, array['application/json'])
on conflict (id) do update
set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Uploads happen with signed upload URLs created with the user's own session,
-- so the object owner is the user. Users may only create objects named
-- `<their user id>/<uuid>.mp3` in audio and `<their user id>/<uuid>.json` in
-- peaks. There are no update or delete policies: objects are immutable for
-- users and are removed by route handlers with the service role.
-- No select policy either: public buckets are read through public URLs, and
-- without a select policy nobody can list other people's folders.

create policy "Users upload audio to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'audio'
    and name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$'
    )
  );

create policy "Users upload peaks to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'peaks'
    and name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'
    )
  );
