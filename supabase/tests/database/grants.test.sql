-- Who may call what, and which tables are private. Runs with `supabase test db` (pgTAP, rolled back).
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- waitlist_normalize_email: the migration spells the stripped characters as \uXXXX escapes, while
-- production holds the characters themselves (see the plan's task 1 result). Same behaviour: every
-- listed invisible character is removed.
select is(
  (select count(*) from (
     select cp from unnest(array[173, 1564, 6158, 65279]) as cp
     union all select generate_series(8203, 8207)
     union all select generate_series(8234, 8238)
     union all select generate_series(8288, 8292)
     union all select generate_series(8294, 8303)
   ) chars
   where public.waitlist_normalize_email('sam' || chr(cp) || '@example.org') <> 'sam@example.org'),
  0::bigint,
  'waitlist_normalize_email strips every listed invisible character'
);
select is(public.waitlist_normalize_email(chr(160) || ' Sam@Example.org. ' || chr(160)), 'sam@example.org',
  'waitlist_normalize_email trims spaces and NBSP, lowercases, and drops trailing dots');

-- ping(): only the keep-alive job (anon) calls it.
select ok(has_function_privilege('anon', 'public.ping()', 'execute'), 'anon can call ping()');
select ok(not has_function_privilege('authenticated', 'public.ping()', 'execute'),
  'signed-in users cannot call ping()');

-- join_waitlist(): visitors and signed-in users alike (intended).
select ok(has_function_privilege('anon', 'public.join_waitlist(text, text)', 'execute'), 'anon can join the waitlist');
select ok(has_function_privilege('authenticated', 'public.join_waitlist(text, text)', 'execute'),
  'signed-in users can join the waitlist');

-- Helpers stay private.
select ok(not has_function_privilege('anon', 'public.waitlist_normalize_email(text)', 'execute'),
  'anon cannot call waitlist_normalize_email');
select ok(not has_function_privilege('authenticated', 'public.waitlist_normalize_email(text)', 'execute'),
  'signed-in users cannot call waitlist_normalize_email');
select ok(not has_function_privilege('anon', 'public.waitlist_email_ok(text)', 'execute'),
  'anon cannot call waitlist_email_ok');
select ok(not has_function_privilege('authenticated', 'public.waitlist_email_ok(text)', 'execute'),
  'signed-in users cannot call waitlist_email_ok');

-- The waitlist table: no direct access for anyone on the API.
select table_privs_are('public', 'waitlist', 'anon', array[]::text[], 'anon has no rights on waitlist');
select table_privs_are('public', 'waitlist', 'authenticated', array[]::text[],
  'signed-in users have no rights on waitlist');

-- A signed-in user really is refused (not just missing a grant on paper).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select throws_ok('select count(*) from public.waitlist', '42501', null, 'a signed-in user cannot read the waitlist');
select throws_ok($$insert into public.waitlist (email, source) values ('x@example.org', 'hero')$$, '42501', null,
  'a signed-in user cannot insert into the waitlist');
select throws_ok('select public.ping()', '42501', null, 'a signed-in user cannot call ping()');
reset role;

-- Rules for every future app table and function (supabase/README.md).
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
$$, 'every table in public has row level security on');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('ping', 'join_waitlist')
$$, 'no function in public is callable by anon except ping and join_waitlist');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and has_function_privilege('authenticated', p.oid, 'execute')
    and p.proname not in ('join_waitlist')
$$, 'no function in public is callable by signed-in users except join_waitlist');

select * from finish();
rollback;
