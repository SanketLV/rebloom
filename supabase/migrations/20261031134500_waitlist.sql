-- Landing-page waitlist (the demand test). Visitors never touch the table: RLS is on with no policies and
-- table grants are revoked from the API roles. The only way in is join_waitlist(), which cleans and
-- validates the email on the server and stores nothing but the email, which form it came from, and when.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null check (source in ('hero', 'final')),
  created_at timestamptz not null default now(),
  constraint waitlist_email_unique unique (email),
  constraint waitlist_email_shape check (
    char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

alter table public.waitlist enable row level security;
revoke all on table public.waitlist from anon, authenticated;

-- review.md: strip invisible format characters, trim, compare case-insensitively.
create function public.waitlist_normalize_email(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(
    regexp_replace(raw, '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]', '', 'g'),
    E' \t\r\n\u00A0'
  ))
$$;
revoke execute on function public.waitlist_normalize_email(text) from public, anon, authenticated;

-- Joining twice is silently fine, so the form never reveals whether an address is already on the list.
create function public.join_waitlist(p_email text, p_source text)
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

  insert into public.waitlist (email, source)
  values (v_email, p_source)
  on conflict (email) do nothing;
end;
$$;
revoke execute on function public.join_waitlist(text, text) from public;
grant execute on function public.join_waitlist(text, text) to anon, authenticated;
