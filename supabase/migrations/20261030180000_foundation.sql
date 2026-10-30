-- Foundation: extensions, the private schema, enum types and reference tables.
--
-- Everything that end users should never call directly (trigger functions,
-- internal helpers) lives in the `private` schema, which PostgREST does not
-- expose. The `public` schema holds tables and the functions that are part
-- of the API on purpose.

create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Enum types ---------------------------------------------------------------

create type public.user_role as enum ('user', 'admin');

-- processing: reserved for a future server side step, not used in v1.
-- live: visible to everyone. hidden: auto hidden by reports or by an admin,
-- visible to the owner and admins. deleted: removed by moderation (takedown),
-- kept as a record for repeat infringer tracking.
create type public.track_status as enum ('processing', 'live', 'hidden', 'deleted');

create type public.track_level as enum ('beginner', 'intermediate', 'advanced');

-- Used both for what an uploader wants feedback on and for comment categories.
create type public.feedback_category as enum (
  'mix',
  'arrangement',
  'vocals',
  'sound_design',
  'vibe'
);

create type public.comment_status as enum ('live', 'hidden', 'deleted');

create type public.reaction_kind as enum ('fire', 'heart', 'eyes', 'headphones');

create type public.report_target as enum ('track', 'comment');

create type public.report_reason as enum (
  'spam',
  'harassment',
  'hate',
  'copyright',
  'ai_generated',
  'other'
);

create type public.report_status as enum ('open', 'resolved', 'dismissed');

create type public.notification_kind as enum ('comment', 'reply', 'helpful');

-- Reputation levels and rate limits ----------------------------------------
--
-- The rows are not written here. The source of truth is
-- src/config/reputation.ts, which generates supabase/seeds/reputation.sql.
-- Functions that need a level fail loudly if the table is empty, so a
-- missing config can never mean "no limits".

create table public.reputation_levels (
  id text primary key check (id ~ '^[a-z_]+$'),
  name text not null check (char_length(name) between 1 and 40),
  min_helpful integer not null unique check (min_helpful >= 0),
  tracks_per_day integer not null check (tracks_per_day > 0),
  tracks_per_week integer not null check (tracks_per_week > 0),
  comments_per_hour integer not null check (comments_per_hour > 0),
  reports_per_day integer not null check (reports_per_day > 0)
);

comment on table public.reputation_levels is
  'Generated from src/config/reputation.ts. Do not edit by hand.';

-- Reserved handles ---------------------------------------------------------

create table public.reserved_handles (
  handle text primary key check (handle ~ '^[a-z0-9_]+$')
);

insert into public.reserved_handles (handle)
values
  ('about'), ('account'), ('admin'), ('administrator'), ('anonymous'),
  ('api'), ('app'), ('assets'), ('auth'), ('callback'), ('copyright'),
  ('dashboard'), ('deleted'), ('design'), ('dmca'), ('email'),
  ('everyone'), ('explore'), ('feed'), ('guidelines'), ('help'),
  ('home'), ('latest'), ('legal'), ('login'), ('logout'), ('mail'),
  ('me'), ('mod'), ('moderator'), ('needears'), ('need_ears'),
  ('needs_ears'), ('new'), ('notifications'), ('null'), ('official'),
  ('privacy'), ('profile'), ('profiles'), ('register'), ('report'),
  ('reports'), ('root'), ('search'), ('security'), ('settings'),
  ('signin'), ('signout'), ('signup'), ('staff'), ('static'),
  ('stats'), ('support'), ('system'), ('team'), ('terms'), ('track'),
  ('tracks'), ('trending'), ('undefined'), ('upload'), ('uploads'),
  ('user'), ('users'), ('www');

-- Seeding switch -----------------------------------------------------------
--
-- supabase/seed.sql sets `needears.seeding = on` for its own session so it
-- can insert fixture data without hitting rate limits or storage checks.
-- End users cannot set session variables through PostgREST.

create function private.is_seeding()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('needears.seeding', true), '') = 'on';
$$;
