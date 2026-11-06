-- Confirming an email address clears any password on the account (migration 20261104070000), so a
-- password set by someone else before the owner confirmed never signs in. Runs with `supabase test
-- db`, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- An attacker's password sign-up and a code sign-up both create an unconfirmed user with a hash.
select lives_ok(
  $$insert into auth.users (id, email, encrypted_password)
    values ('cccccccc-0000-4000-8000-000000000001', 'victim@example.org', '$2a$10$attackerattackerattack')$$,
  'an unconfirmed account can still be created (code sign-ups store a random password too)');

update auth.users set email_confirmed_at = now() where id = 'cccccccc-0000-4000-8000-000000000001';
select is(
  (select encrypted_password from auth.users where id = 'cccccccc-0000-4000-8000-000000000001'),
  '',
  'confirming the address clears the password set before it');

update auth.users set encrypted_password = '$2a$10$ownerownerownerownerow' where id = 'cccccccc-0000-4000-8000-000000000001';
update auth.users set email_confirmed_at = now() where id = 'cccccccc-0000-4000-8000-000000000001';
select is(
  (select encrypted_password from auth.users where id = 'cccccccc-0000-4000-8000-000000000001'),
  '$2a$10$ownerownerownerownerow',
  'a later update of an already-confirmed account leaves its password alone');

select ok(
  exists (select 1 from pg_trigger where tgname = 'rebloom_clear_password_on_confirm' and tgrelid = 'auth.users'::regclass),
  'the trigger is installed on auth.users');
select ok(
  not has_function_privilege('authenticated', 'public.rebloom_clear_password_on_confirm()', 'execute')
  and not has_function_privilege('anon', 'public.rebloom_clear_password_on_confirm()', 'execute'),
  'the trigger function is not callable by the API roles');

select * from finish();
rollback;
