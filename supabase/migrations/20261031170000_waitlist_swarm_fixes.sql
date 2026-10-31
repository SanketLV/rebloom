-- Fixes from the adversarial review (2026-10-31).

-- #4: the server accepted anything except "@" and whitespace (control characters, HTML, invisible characters
-- outside the strip list, full-width letters, trailing dots). Enforce the same ASCII grammar the browser's
-- <input type=email> uses, after cleaning, and drop trailing dots so "a@x.com." and "a@x.com" are one row.
create or replace function public.waitlist_normalize_email(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(normalize(lower(btrim(
    regexp_replace(raw, '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]', '', 'g'),
    E' \t\r\n\u00A0'
  )), NFC), '\.+$', '')
$$;

create function public.waitlist_email_ok(email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select email is not null
    and char_length(email) <= 254
    and char_length(split_part(email, '@', 1)) <= 64
    and email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
$$;
revoke execute on function public.waitlist_email_ok(text) from public, anon, authenticated;

-- NOT VALID: enforced for every new row. Old test rows that predate it (rebloom-test@...) block validation;
-- after deleting them, run: alter table public.waitlist validate constraint waitlist_email_shape;
alter table public.waitlist drop constraint waitlist_email_shape;
alter table public.waitlist add constraint waitlist_email_shape check (public.waitlist_email_ok(email)) not valid;

create or replace function public.join_waitlist(p_email text, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.waitlist_normalize_email(p_email);
begin
  if not public.waitlist_email_ok(v_email) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('hero', 'final') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  if v_email ~ '@(.+\.)?example\.(com|org|net)$' or v_email ~ '\.(test|invalid|example|localhost)$' then
    return;
  end if;

  insert into public.waitlist (email, source)
  values (v_email, p_source)
  on conflict (email) do nothing;
end;
$$;

-- #1: Supabase counts "user database activity"; make the keep-alive ping read the table. It returns only
-- true, never rows or counts, so running it as the owner reveals nothing.
create or replace function public.ping()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform 1 from public.waitlist limit 1;
  return true;
end;
$$;
