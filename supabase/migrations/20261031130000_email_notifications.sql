-- Email for comments, replies and Helpful.
--
-- Every `comment`, `reply` or `helpful` notification for someone who has
-- email_notifications on also gets a row in `email_queue`. GET
-- /api/cron/send-emails runs every hour, sends one email per person with
-- everything still waiting, and marks the rows sent. Sent rows are deleted
-- after 7 days. Moderation notices are not emailed.
--
-- A queue row points at its notification instead of copying names and
-- text, so deleting a comment, a track or an account also removes what
-- would have been emailed (the notification cascades, and the row with it).
-- The content is read when the email is sent. The queue is service role
-- only: RLS on, no policies, no grants.

alter table public.profiles
  add column email_notifications boolean not null default true;

grant update (email_notifications) on public.profiles to authenticated;

create table public.email_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_id uuid not null unique references public.notifications (id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index email_queue_unsent_idx on public.email_queue (created_at) where sent_at is null;
create index email_queue_user_id_idx on public.email_queue (user_id);
create index email_queue_sent_at_idx on public.email_queue (sent_at) where sent_at is not null;

alter table public.email_queue enable row level security;
revoke all on public.email_queue from anon, authenticated;

create function private.notifications_queue_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Fixtures are not emailed.
  if private.is_seeding() then
    return null;
  end if;

  if new.kind in ('comment', 'reply', 'helpful')
    and exists (
      select 1 from public.profiles
      where id = new.user_id and email_notifications and banned_at is null
    )
  then
    insert into public.email_queue (user_id, notification_id) values (new.user_id, new.id);
  end if;
  return null;
end;
$$;

create trigger notifications_queue_email
  after insert on public.notifications
  for each row execute function private.notifications_queue_email();

-- One row per person with waiting emails, oldest first, at most p_limit
-- people (80, under the daily quota of the email provider). Rows of people
-- who have since turned email off, or were banned, are dropped first, and
-- so are rows about a comment or track that is no longer live.
create function public.email_batch(p_limit integer default 80)
returns table (user_id uuid, email text, items jsonb, queue_ids bigint[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.email_queue q
  using public.profiles p
  where q.user_id = p.id
    and q.sent_at is null
    and (not p.email_notifications or p.banned_at is not null);

  delete from public.email_queue q
  using public.notifications n
  where q.notification_id = n.id
    and q.sent_at is null
    and (
      not exists (select 1 from public.tracks t where t.id = n.track_id and t.status = 'live')
      or (n.comment_id is not null
        and not exists (select 1 from public.comments c where c.id = n.comment_id and c.status = 'live'))
    );

  return query
  select q.user_id, u.email::text,
    jsonb_agg(
      jsonb_build_object(
        'kind', n.kind,
        'created_at', n.created_at,
        'actor', coalesce(nullif(a.display_name, ''), a.handle),
        'track_title', t.title,
        'track_slug', t.slug,
        'time_ms', c.time_ms,
        'excerpt', left(c.body, 200)
      ) order by n.created_at
    ),
    array_agg(q.id order by q.created_at)
  from public.email_queue q
  join public.notifications n on n.id = q.notification_id
  join auth.users u on u.id = q.user_id
  join public.tracks t on t.id = n.track_id
  left join public.profiles a on a.id = n.actor_id
  left join public.comments c on c.id = n.comment_id
  where q.sent_at is null and u.email is not null
  group by q.user_id, u.email
  order by min(q.created_at)
  limit least(greatest(p_limit, 1), 80);
end;
$$;

create function public.mark_emails_sent(p_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_queue set sent_at = now() where id = any (p_ids) and sent_at is null;
$$;

create or replace function private.purge_expired_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.track_upload_ips where created_at < now() - interval '30 days';
  delete from private.rate_limit_events where created_at < now() - interval '8 days';
  delete from public.email_queue where sent_at < now() - interval '7 days';
$$;

revoke execute on function private.notifications_queue_email() from public, anon, authenticated;
revoke execute on function public.email_batch(integer) from public, anon, authenticated;
revoke execute on function public.mark_emails_sent(bigint[]) from public, anon, authenticated;
grant execute on function public.email_batch(integer) to service_role;
grant execute on function public.mark_emails_sent(bigint[]) to service_role;
