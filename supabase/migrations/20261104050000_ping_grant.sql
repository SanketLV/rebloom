-- ping() is for the keep-alive job, which calls it as anon. Supabase's default grants also gave it
-- to authenticated (security advisor: "Signed-In Users Can Execute SECURITY DEFINER Function").
-- App users don't need it. Revoking from public alone isn't enough on Supabase: new functions are
-- granted to anon and authenticated directly, so every new function revokes from all three.
revoke execute on function public.ping() from authenticated;

-- Check it took effect. A REVOKE by a role that isn't the grantor only warns and succeeds; this
-- makes such a no-op fail the migration (and roll it back) instead of passing silently.
do $$
begin
  if has_function_privilege('authenticated', 'public.ping()', 'execute') then
    raise exception 'ping() is still callable by authenticated: the revoke had no effect (check who granted it)';
  end if;
  if not has_function_privilege('anon', 'public.ping()', 'execute') then
    raise exception 'ping() is no longer callable by anon: the keep-alive job would fail';
  end if;
end $$;
