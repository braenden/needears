-- Audio and peaks follow the visibility of their track.
--
-- The buckets were public, so a file stayed reachable at its public URL
-- after the track was hidden by reports, hidden or taken down by an admin,
-- or posted by a banned user. A copyright takedown did not take anything
-- down. Now both buckets are private and a file can be read (signed URL,
-- download) only by someone who can see a track that uses it: everyone for
-- live tracks, the owner and admins for the rest. The subqueries run with
-- the caller's RLS on tracks, so this reuses the track policies instead of
-- repeating them. Signed URLs handed out while a track was live still work
-- until they expire, so keep their lifetime short.
--
-- Uploads are unchanged: the insert policies only need a reservation.

update storage.buckets set public = false where id in ('audio', 'peaks');

create policy "Audio of visible tracks is readable" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'audio'
    and exists (select 1 from public.tracks t where t.audio_key = objects.name)
  );

create policy "Peaks of visible tracks are readable" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'peaks'
    and exists (select 1 from public.tracks t where t.peaks_key = objects.name)
  );
