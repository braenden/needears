-- Issue 007: avatar_url accepted any https URL. Every visitor who saw the
-- profile or a comment loaded it, so its host learned their IP (a tracking
-- pixel), and a same site URL such as /api/account/export made every viewer
-- run their own export. The CSP already only loads images from Google, so
-- the column now only accepts Google profile pictures. Avatar upload (issue
-- 026) will add our own bucket here and to the CSP.

update public.profiles
set avatar_url = null
where avatar_url !~ '^https://lh3\.googleusercontent\.com/';

alter table public.profiles drop constraint profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url ~ '^https://lh3\.googleusercontent\.com/' and char_length(avatar_url) <= 500);

-- Sign up copies the picture from the identity provider's metadata, which
-- the user controls for email sign up. Drop anything else instead of
-- failing the sign up.
create or replace function private.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.handle := lower(btrim(new.handle));
  new.display_name := btrim(new.display_name);
  new.bio := btrim(new.bio);

  if tg_op = 'INSERT' and new.avatar_url !~ '^https://lh3\.googleusercontent\.com/' then
    new.avatar_url := null;
  end if;

  if (tg_op = 'INSERT' or new.handle is distinct from old.handle)
    and exists (select 1 from public.reserved_handles where handle = new.handle)
  then
    raise exception 'handle_reserved' using errcode = '22023';
  end if;

  return new;
end;
$$;
