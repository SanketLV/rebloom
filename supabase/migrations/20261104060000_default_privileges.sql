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

-- Check it took effect, for the schema entry and any global entry (both apply). A revoke against a
-- default entry it doesn't match does nothing and says nothing; this fails the migration instead.
do $$
declare
  leftover text;
begin
  select string_agg(pg_get_userbyid(a.grantee) || ' ' || a.privilege_type, ', ')
  into leftover
  from pg_default_acl d, aclexplode(d.defaclacl) a
  where d.defaclrole = 'postgres'::regrole
    and d.defaclobjtype = 'r'
    and (d.defaclnamespace = 'public'::regnamespace or d.defaclnamespace = 0)
    and (
      a.grantee = 'anon'::regrole
      or (a.grantee = 'authenticated'::regrole
          and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'))
    );
  if leftover is not null then
    raise exception 'default privileges on new public tables still grant: %', leftover;
  end if;
end $$;
