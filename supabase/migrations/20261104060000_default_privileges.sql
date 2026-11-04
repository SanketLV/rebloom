-- Supabase's default grants give anon and authenticated every privilege on each new table and view
-- in public (`arwdDxtm`). Narrow them:
--   anon: nothing. App tables never need it, and a view someone forgets to lock down (views skip
--         row level security unless security_invoker is set) would otherwise be readable without
--         signing in. The waitlist is reached only through functions, not tables.
--   authenticated: no TRUNCATE (it ignores row level security: one signed-in user could empty
--         everyone's rows), MAINTAIN (includes LOCK TABLE), TRIGGER or REFERENCES.
-- Not reachable through the data API today, but no table should depend on that. Tables still
-- grant select/insert/update to authenticated themselves (supabase/README.md). Existing tables:
-- the waitlist already revokes everything.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from authenticated;
