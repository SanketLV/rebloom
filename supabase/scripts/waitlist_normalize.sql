-- Property check for waitlist_normalize_email / waitlist_email_ok: 5,000 random strings mixing letters,
-- accents, spaces, invisible and control characters, HTML and full-width forms. Run in the SQL editor;
-- every count except "cases" must be 0.
with gen as (
  select i,
    (select string_agg(
        (array['A','b','C','x','.','+','@',chr(233),chr(214),' ',chr(9),chr(160),chr(8203),chr(8205),chr(65279),chr(8288),chr(8238),chr(173),'1','-',chr(917569),chr(65529),chr(1536),chr(65351),'<',chr(27),'..'])[1 + floor(random()*27)::int], '')
     from generate_series(1, 1 + (random()*40)::int) g where i > 0) as raw
  from generate_series(1, 5000) i
), checked as (
  select raw, public.waitlist_normalize_email(raw) as n from gen
)
select
  count(*) as cases,
  count(*) filter (where n ~ ('[' || chr(173) || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238) || chr(8288) || '-' || chr(8292) || chr(65279) || ']')) as still_has_invisible,
  count(*) filter (where n <> public.waitlist_normalize_email(n)) as not_idempotent,
  count(*) filter (where n <> lower(n)) as not_lowercase,
  count(*) filter (where n ~ ('^[ ' || chr(9) || chr(160) || ']') or n ~ ('[ ' || chr(9) || chr(160) || ']$')) as untrimmed,
  count(*) filter (where n <> normalize(n, NFC)) as not_nfc,
  -- anything the server would accept must be plain printable ASCII with no trailing dot
  count(*) filter (where public.waitlist_email_ok(n) and (n ~ '[^!-~]' or n ~ '[.]$')) as accepted_but_unsafe,
  -- composed U+00E9 and decomposed e + U+0301 must clean to the same address
  count(*) filter (where public.waitlist_normalize_email(replace(raw, chr(233), 'e' || chr(769))) <> n) as nfd_differs
from checked;

-- Accept path: 5,000 realistic addresses wrapped in leading/trailing junk. Random strings above almost never
-- form a valid email, so this checks what actually gets stored. Want accepted = cases and every other count 0.
with base as (
  select i,
    (select string_agg(substr('abcxyz019.+-_', 1 + floor(random()*13)::int, 1), '') from generate_series(1, 1 + (random()*12)::int) g where i > 0) as loc,
    (select string_agg(substr('abcdefgh0123', 1 + floor(random()*12)::int, 1), '') from generate_series(1, 2 + (random()*8)::int) g where i > 0) as dom
  from generate_series(1, 5000) i
), gen as (
  select i,
    (array['', ' ', chr(8203), chr(65279), chr(160)])[1 + (i % 5)]
    || (case when i % 3 = 0 then upper(loc) else loc end) || '@' || dom || '.com'
    || (array['', '.', ' . ', chr(8203), '..', chr(9)])[1 + (i % 6)] as raw
  from base
), checked as (select raw, public.waitlist_normalize_email(raw) as n from gen)
select
  count(*) as cases,
  count(*) filter (where public.waitlist_email_ok(n)) as accepted,
  count(*) filter (where public.waitlist_email_ok(n) and (n ~ '[^!-~]' or n ~ '[.]$' or n <> lower(n))) as accepted_but_unsafe,
  count(*) filter (where n <> public.waitlist_normalize_email(n)) as not_idempotent,
  count(*) filter (where public.waitlist_email_ok(n) and n <> public.waitlist_normalize_email(regexp_replace(raw, '[.[:space:]]+$', ''))) as junk_changes_identity
from checked;
