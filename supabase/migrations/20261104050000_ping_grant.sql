-- ping() is for the keep-alive job, which calls it as anon. Supabase's default grants also gave it
-- to authenticated (security advisor: "Signed-In Users Can Execute SECURITY DEFINER Function").
-- App users don't need it. Revoking from public alone isn't enough on Supabase: new functions are
-- granted to anon and authenticated directly, so every new function revokes from all three.
revoke execute on function public.ping() from authenticated;
