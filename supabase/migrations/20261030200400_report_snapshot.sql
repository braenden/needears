-- With the trust rules, most reported posts stay live
-- until an admin looks, and live posts can be edited. A harasser could
-- replace a reported comment with "." (or an owner rename a reported
-- track), so the admin judged text that was never reported. Every report
-- now keeps a copy of what was reported, taken when it was filed.

alter table public.reports
  add column reported_text text not null default '' check (char_length(reported_text) <= 2200);

create or replace function private.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_seeding() then
    return new;
  end if;

  new.status := 'open';
  new.resolved_by := null;
  new.resolved_at := null;
  new.created_at := now();
  new.details := btrim(new.details);

  if new.target_type = 'comment' then
    select c.body into new.reported_text from public.comments c where c.id = new.comment_id;
  else
    select concat_ws(E'\n\n', t.title, nullif(t.description, ''))
    into new.reported_text
    from public.tracks t where t.id = new.track_id;
  end if;
  new.reported_text := coalesce(left(new.reported_text, 2200), '');

  perform private.consume_rate_limit(new.reporter_id, 'report');
  return new;
end;
$$;
