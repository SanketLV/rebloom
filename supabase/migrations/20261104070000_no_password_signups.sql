-- Rebloom signs in with a 6-digit email code (and later Google/Apple), never a password. The email
-- provider still accepts password sign-ups through the API, which allows a pre-sign-up account
-- takeover: someone signs up with another person's email and a password, the owner later signs
-- in with a code to the same account, and the password still works (adversarial review finding 1).
-- Refuse any new account that comes with a password. Code sign-ups store an empty password.
create function public.rebloom_refuse_password_signups()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'password sign-ups are not allowed' using errcode = '42501';
end;
$$;
revoke execute on function public.rebloom_refuse_password_signups() from public, anon, authenticated;

create trigger rebloom_refuse_password_signups
  before insert on auth.users
  for each row
  when (new.encrypted_password is not null and new.encrypted_password <> '')
  execute function public.rebloom_refuse_password_signups();

-- Check it took effect.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'rebloom_refuse_password_signups' and tgrelid = 'auth.users'::regclass and tgenabled <> 'D'
  ) then
    raise exception 'the trigger refusing password sign-ups is missing or disabled';
  end if;
end $$;
