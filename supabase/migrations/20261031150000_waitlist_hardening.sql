-- Break-test fixes for the waitlist (2026-10-31).

-- #6: the same accented address typed composed (U+00E9) or decomposed (e + U+0301) must be one row: NFC-normalize.
create or replace function public.waitlist_normalize_email(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select normalize(lower(btrim(
    regexp_replace(raw, '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]', '', 'g'),
    E' \t\r\n\u00A0'
  )), NFC)
$$;

-- #9: reserved test domains (RFC 2606 / 6761) are validated but never stored, so test runs and
-- "test@example.com" sign-ups don't pollute the live list or the demand numbers.
create or replace function public.join_waitlist(p_email text, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.waitlist_normalize_email(p_email);
begin
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
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

-- #1: free projects pause after a week without traffic. A scheduled job calls this to keep the project awake.
create function public.ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select true $$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon;
