-- Rebloom signs in with a 6-digit email code (and later Google/Apple), never a password. The email
-- provider still accepts password sign-ups through the API, which allows a pre-sign-up account
-- takeover: someone signs up with another person's email and a password, the owner later confirms
-- the address by signing in with a code, and the password would still work (adversarial review
-- finding 1). With email confirmation on (the hosted default; config.toml locally), the attacker's
-- account stays unconfirmed and can't sign in; this clears any password the moment the owner
-- confirms the address. Code sign-ups get a random password from the auth server, which is cleared
-- too: nothing uses it. (Refusing passwords at sign-up isn't possible: code sign-ups have one too.)
create function public.rebloom_clear_password_on_confirm()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.encrypted_password := '';
  return new;
end;
$$;
revoke execute on function public.rebloom_clear_password_on_confirm() from public, anon, authenticated;

create trigger rebloom_clear_password_on_confirm
  before update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.rebloom_clear_password_on_confirm();

-- Check it took effect.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'rebloom_clear_password_on_confirm' and tgrelid = 'auth.users'::regclass and tgenabled <> 'D'
  ) then
    raise exception 'the trigger clearing passwords on confirmation is missing or disabled';
  end if;
end $$;
