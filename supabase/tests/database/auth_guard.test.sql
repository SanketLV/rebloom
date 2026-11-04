-- Password sign-ups are refused at the database (migration 20261104070000). Runs with `supabase
-- test db`, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select throws_ok(
  $$insert into auth.users (id, email, encrypted_password)
    values ('cccccccc-0000-4000-8000-000000000001', 'victim@example.org', '$2a$10$abcdefghijklmnopqrstuv')$$,
  '42501', 'password sign-ups are not allowed',
  'an account created with a password is refused');
select lives_ok(
  $$insert into auth.users (id, email, encrypted_password)
    values ('cccccccc-0000-4000-8000-000000000002', 'code@example.org', '')$$,
  'an account created by email code (empty password) is allowed');
select lives_ok(
  $$insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000003', 'null@example.org')$$,
  'an account with no password at all is allowed');
select ok(
  not has_function_privilege('authenticated', 'public.rebloom_refuse_password_signups()', 'execute')
  and not has_function_privilege('anon', 'public.rebloom_refuse_password_signups()', 'execute'),
  'the trigger function is not callable by the API roles');

select * from finish();
rollback;
