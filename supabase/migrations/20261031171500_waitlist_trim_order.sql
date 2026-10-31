-- Fix for 20261031170000: stripping trailing dots after the trim left "a@x.com ." as "a@x.com " (untrimmed,
-- and a second pass changed it again). Strip trailing dots and whitespace together, then trim the front.
create or replace function public.waitlist_normalize_email(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select normalize(lower(ltrim(
    regexp_replace(regexp_replace(raw, '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]', '', 'g'), '[.[:space:]\u00A0]+$', ''),
    E' \t\r\n\u00A0'
  )), NFC)
$$;
