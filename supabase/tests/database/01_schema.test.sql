-- Schema level guarantees: RLS everywhere, locked down functions and grants,
-- buckets with limits, the cleanup job and the reputation config.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select tables_are(
  'public',
  array[
    'comments', 'genres', 'notifications', 'profiles', 'reactions', 'reports',
    'reputation_levels', 'reserved_handles', 'track_upload_ips', 'tracks',
    'trust_rules'
  ],
  'public has exactly the expected tables'
);

select is_empty(
  $$ select n.nspname || '.' || c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity $$,
  'every table in public and private has RLS enabled'
);

select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
       ) $$,
  'every security definer function pins search_path'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.is_admin()'::regprocedure),
  'is_admin() is security definer'
);

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use the private schema');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use the private schema');

select ok(
  not has_function_privilege('anon', 'public.admin_set_banned(uuid, boolean)', 'execute'),
  'anon cannot call admin functions'
);
select ok(
  not has_function_privilege('anon', 'public.track_upload_allowance()', 'execute'),
  'anon cannot call track_upload_allowance'
);
select ok(
  has_function_privilege('anon', 'public.feed_trending(text, integer, integer)', 'execute'),
  'anon can call the feeds'
);

select ok(not has_table_privilege('authenticated', 'public.tracks', 'insert'), 'users cannot insert tracks directly');
select ok(not has_table_privilege('authenticated', 'public.track_upload_ips', 'select'), 'users cannot read upload IPs');
select ok(not has_table_privilege('anon', 'public.track_upload_ips', 'select'), 'anon cannot read upload IPs');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'insert'), 'users cannot create notifications');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'role', 'update'), 'users cannot change roles');
select ok(not has_column_privilege('authenticated', 'public.comments', 'status', 'update'), 'users cannot change comment status');
select ok(not has_column_privilege('authenticated', 'public.tracks', 'status', 'update'), 'users cannot change track status');

select results_eq(
  $$ select id, public, file_size_limit, allowed_mime_types from storage.buckets
     where id in ('audio', 'peaks') order by id $$,
  $$ values ('audio', false, 26214400::bigint, array['audio/mpeg']),
            ('peaks', false, 262144::bigint, array['application/json']) $$,
  'audio and peaks buckets are private with size and type limits'
);

select is(
  (select count(*)::integer from cron.job where jobname = 'purge-expired-data'),
  1,
  'the cleanup job is scheduled'
);

select results_eq(
  'select name, min_helpful from public.reputation_levels order by min_helpful',
  $$ values ('New ear', 0), ('Listener', 3), ('Trusted ear', 15), ('Golden ear', 60) $$,
  'reputation levels match src/config/reputation.ts'
);

select is((public.reputation_level(16)).id, 'trusted_ear', 'reputation_level picks the highest level reached');

select * from finish();
rollback;
