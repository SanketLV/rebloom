-- The Kindwise diagnosis counters (migration *_kindwise_diagnosis.sql): who can see what, and how
-- begin/attach/fail/end_diagnosis count scans and credits. Runs with `supabase test db` (rolled back).
-- now() is fixed inside this transaction, so "older than" cases backdate rows instead of waiting.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- ---- shape and access ----
select has_table('public', 'scan_usage', 'scan_usage exists');
select has_table('public', 'kindwise_daily_usage', 'kindwise_daily_usage exists');
select has_table('public', 'diagnosis_requests', 'diagnosis_requests exists');

select table_privs_are('public', 'scan_usage', 'authenticated', array['SELECT'],
  'signed-in users may only read scan_usage');
select table_privs_are('public', 'scan_usage', 'anon', array[]::text[], 'anon has no rights on scan_usage');
select table_privs_are('public', 'kindwise_daily_usage', 'authenticated', array[]::text[],
  'signed-in users have no rights on kindwise_daily_usage');
select table_privs_are('public', 'kindwise_daily_usage', 'anon', array[]::text[],
  'anon has no rights on kindwise_daily_usage');
select table_privs_are('public', 'diagnosis_requests', 'authenticated', array[]::text[],
  'signed-in users have no rights on diagnosis_requests');
select table_privs_are('public', 'diagnosis_requests', 'anon', array[]::text[],
  'anon has no rights on diagnosis_requests');
select has_table('public', 'kindwise_deletions', 'kindwise_deletions exists');
select table_privs_are('public', 'kindwise_deletions', 'authenticated', array[]::text[],
  'signed-in users have no rights on kindwise_deletions');
select table_privs_are('public', 'kindwise_deletions', 'anon', array[]::text[],
  'anon has no rights on kindwise_deletions');
select ok((select relrowsecurity from pg_class where oid = 'public.kindwise_deletions'::regclass),
  'kindwise_deletions has row level security on');
select ok(not has_function_privilege('authenticated', 'public.queue_kindwise_deletion()', 'execute')
  and not has_function_privilege('anon', 'public.queue_kindwise_deletion()', 'execute'),
  'no API role can call the queue trigger function');

select ok(not has_function_privilege('authenticated', 'public.begin_diagnosis(uuid, uuid)', 'execute'),
  'signed-in users cannot call begin_diagnosis');
select ok(not has_function_privilege('anon', 'public.begin_diagnosis(uuid, uuid)', 'execute'),
  'anon cannot call begin_diagnosis');
select ok(has_function_privilege('service_role', 'public.begin_diagnosis(uuid, uuid)', 'execute'),
  'the diagnose function (service_role) can call begin_diagnosis');
select ok(has_function_privilege('service_role', 'public.attach_token(uuid, uuid, text)', 'execute'),
  'service_role can call attach_token');
select ok(has_function_privilege('service_role', 'public.fail_diagnosis(uuid, uuid, boolean)', 'execute'),
  'service_role can call fail_diagnosis');
select ok(has_function_privilege('service_role', 'public.end_diagnosis(uuid, uuid)', 'execute'),
  'service_role can call end_diagnosis');
select ok(has_function_privilege('service_role', 'public.expired_diagnoses(integer)', 'execute'),
  'service_role can call expired_diagnoses');
select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('begin_diagnosis', 'attach_token', 'fail_diagnosis', 'end_diagnosis', 'expired_diagnoses',
                      'queue_kindwise_deletion')
    and (not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false))
$$, 'every diagnosis function is security definer with an empty search_path');

-- ---- two users ----
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'diag-a@example.org'),
  ('bbbbbbbb-0000-4000-8000-0000000000d2', 'diag-b@example.org');

-- ---- counting ----
select is(public.begin_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a001') ->> 'outcome',
  'started', 'first scan starts');
select is((select count from public.scan_usage where user_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), 1,
  'first scan counts 1');
select is((select credits from public.kindwise_daily_usage where day = (now() at time zone 'utc')::date), 2,
  'first scan reserves 2 credits');
select is(public.begin_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a001') ->> 'outcome',
  'running', 'the same scan again while it runs → running');
select is((select count from public.scan_usage where user_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), 1,
  'a repeat is not counted');
select is((select credits from public.kindwise_daily_usage where day = (now() at time zone 'utc')::date), 2,
  'a repeat reserves no credits');

select is(public.attach_token('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a001', 'tok-1'),
  true, 'attach_token stores the Kindwise token and says so');
select is(public.attach_token('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000ff', 'tok-orphan'),
  false, 'attach_token says when the request row is gone (removed while Kindwise worked)');
select is(public.begin_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a001'),
  jsonb_build_object('outcome', 'has_token', 'access_token', 'tok-1', 'scans_left', 2,
    'resets_at', to_jsonb((date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc')),
  'a scan with a token → has_token with the token, scans left and the reset time, not counted again');

select is(public.begin_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a002') ->> 'scans_left',
  '1', 'second scan: 1 left');
select is(public.begin_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a003') ->> 'scans_left',
  '0', 'third scan: 0 left');
select is(public.begin_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a004') ->> 'outcome',
  'quota', 'fourth scan in a month → quota');
select is((select count from public.scan_usage where user_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), 3,
  'quota is not counted');
select ok(not exists (select 1 from public.diagnosis_requests where scan_id = '00000000-0000-4000-8000-00000000a004'),
  'quota leaves no request row');
select is((select credits from public.kindwise_daily_usage where day = (now() at time zone 'utc')::date), 6,
  'quota reserves no credits');

-- ---- releasing ----
select lives_ok($$select public.fail_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a003', true)$$,
  'Kindwise refused the create: release scan and credits');
select is((select count from public.scan_usage where user_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), 2,
  'fail_diagnosis gives the scan back');
select is((select credits from public.kindwise_daily_usage where day = (now() at time zone 'utc')::date), 4,
  'fail_diagnosis(…, true) gives the credits back');
select lives_ok($$select public.fail_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a002', false)$$,
  'not a plant: release the scan only');
select is((select credits from public.kindwise_daily_usage where day = (now() at time zone 'utc')::date), 4,
  'fail_diagnosis(…, false) keeps the credits (Kindwise spent them)');
select is((select count from public.scan_usage where user_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), 1,
  'and the scan is back');

-- A call that crashed before Kindwise answered (no token, older than 60 s) is started over.
select public.begin_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a005');
update public.diagnosis_requests set created_at = now() - interval '61 seconds'
  where scan_id = '00000000-0000-4000-8000-00000000a005';
select is(public.begin_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a005') ->> 'outcome',
  'started', 'a stale running scan starts over');
select is((select count from public.scan_usage where user_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), 2,
  'and is counted once, not twice');

-- end_diagnosis: the app has the result; the row goes, the count stays.
select lives_ok($$select public.end_diagnosis('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a001')$$,
  'end_diagnosis runs');
select ok(not exists (select 1 from public.diagnosis_requests where scan_id = '00000000-0000-4000-8000-00000000a001'),
  'end_diagnosis deletes the request row');

select ok(exists (select 1 from public.kindwise_deletions where access_token = 'tok-1'),
  'a deleted request row leaves its Kindwise token queued for deletion');
select ok(not exists (select 1 from public.kindwise_deletions where created_at = now() and access_token <> 'tok-1'),
  'rows without a token (failed scans) queue nothing');

-- ---- daily cap and month rollover (user B) ----
update public.kindwise_daily_usage set credits = 39 where day = (now() at time zone 'utc')::date;
select is(public.begin_diagnosis('bbbbbbbb-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000b001') ->> 'outcome',
  'daily_cap', 'over the daily credit cap → daily_cap');
select ok(not exists (select 1 from public.scan_usage where user_id = 'bbbbbbbb-0000-4000-8000-0000000000d2' and count > 0),
  'daily_cap is not counted');
update public.kindwise_daily_usage set credits = 0 where day = (now() at time zone 'utc')::date;
insert into public.scan_usage (user_id, month, count) values
  ('bbbbbbbb-0000-4000-8000-0000000000d2', (date_trunc('month', now() at time zone 'utc') - interval '1 month')::date, 3);
select is(public.begin_diagnosis('bbbbbbbb-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000b002') ->> 'outcome',
  'started', 'last month''s 3 scans do not count this month');

-- ---- expired rows ----
update public.diagnosis_requests set created_at = now() - interval '8 days'
  where scan_id = '00000000-0000-4000-8000-00000000b002';
select is((select array_agg(scan_id) from public.expired_diagnoses(5)),
  array['00000000-0000-4000-8000-00000000b002'::uuid], 'expired_diagnoses lists rows older than 7 days');

-- ---- row level security, as user A ----
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select is((select array_agg(distinct user_id) from public.scan_usage), array['aaaaaaaa-0000-4000-8000-0000000000d1'::uuid],
  'a user reads only their own scan_usage rows');
select throws_ok($$update public.scan_usage set count = 0$$, '42501', null, 'a user cannot reset their count');
select throws_ok('select 1 from public.diagnosis_requests', '42501', null, 'a user cannot read diagnosis_requests');
reset role;

-- ---- account deletion ----
select public.attach_token('aaaaaaaa-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a005', 'tok-a5');
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-0000000000d1';
select ok(exists (select 1 from public.kindwise_deletions where access_token = 'tok-a5'),
  'the account cascade keeps its Kindwise tokens queued for deletion');
select ok(not exists (select 1 from public.scan_usage where user_id = 'aaaaaaaa-0000-4000-8000-0000000000d1')
  and not exists (select 1 from public.diagnosis_requests where user_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'),
  'deleting the account deletes its usage and request rows');

select * from finish();
rollback;
