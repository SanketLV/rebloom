-- Supabase's default grants give anon and authenticated every privilege on each new table in
-- public (`arwdDxtm`). Three of them don't belong to an API role: TRUNCATE ignores row level
-- security (one signed-in user could empty everyone's rows), MAINTAIN includes LOCK TABLE, and
-- TRIGGER lets the role add triggers; REFERENCES isn't needed either. Not reachable through the
-- data API today, but no table should depend on that. Tables still grant select/insert/update
-- themselves (supabase/README.md). Existing tables: the waitlist already revokes everything.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
