# Rebloom backend (Supabase)

One Supabase project, `rebloom` (ref `vhxcgmupopeochwvmwcv`, us-east-1, Postgres 17), serves the landing page's waitlist and the app. Specs: `.planning/specs/supabase-foundation.md`, `.planning/specs/accounts.md`.

## The one rule

**Production changes only through `supabase db push --remote` of migrations that were reviewed and merged.** Never edit tables, functions, grants or policies in the dashboard or the SQL editor. Build and break things on the local stack instead.

## Commands

Supabase CLI v3, run from the repo root as `npx -y supabase@3 …` (or `supabase …` if installed with Homebrew). Docker must be running for anything local.

In CLI v3, `migration list`, `db diff`, `db push` and `db reset` act on the **local** stack unless you add `--remote`.

| What | Command |
|---|---|
| Start / stop the local stack | `npx -y supabase@3 start` / `npx -y supabase@3 stop` |
| URLs and keys of the local stack | `npx -y supabase@3 status` |
| Rebuild the local database from the migrations | `npx -y supabase@3 db reset` |
| New migration | `npx -y supabase@3 migration new <snake_case_name>` |
| Database tests (pgTAP) | `npx -y supabase@3 test db` |
| Local API tests (sign-in, access rules) | `node --test "supabase/tests/local/*.test.mjs"` |
| Static checks (no network) | `node --test "supabase/tests/*.test.mjs"` |
| Waitlist tests against **production** (opt-in) | `REBLOOM_PROD_TESTS=1 node --test "supabase/tests/production/*.test.mjs"` (PowerShell: `$env:REBLOOM_PROD_TESTS=1; node --test …`) |
| Connect the CLI to production (once per machine) | `npx -y supabase@3 login`, then `npx -y supabase@3 link --project-ref vhxcgmupopeochwvmwcv` |
| Compare production with the migrations | `npx -y supabase@3 migration list --remote`, `npx -y supabase@3 db diff --remote` |
| Ship reviewed migrations | `npx -y supabase@3 db push --remote --dry-run`, then without `--dry-run` |
| Serve Edge Functions locally (hot reload) | `npx -y supabase@3 functions serve` (the local API tests for `delete-account` need it) |
| Ship a reviewed, merged function | `npx -y supabase@3 functions deploy delete-account` (reads `verify_jwt` from `config.toml`) |

Local services: API `http://127.0.0.1:54321`, database `127.0.0.1:54322`, Mailpit (catches every auth email) `http://127.0.0.1:54324`. A phone running the app reaches the stack through this computer's LAN address, not `localhost` (see `app/README.md`).

## What's here

| Path | What |
|---|---|
| `config.toml` | Local stack settings: no anonymous accounts, no SMS, email sign-in by 6-digit code (10 min), seed off |
| `templates/sign_in_code.html` | The sign-in email: the code only, no link |
| `migrations/` | Every schema change, in order. The first four are the waitlist and keep the version numbers production recorded |
| `tests/database/*.test.sql` | pgTAP: grants, the RLS template, a seeded random RLS property test |
| `tests/local/*.test.mjs` | Through the local API. A guard refuses any non-local address before the first request |
| `tests/*.test.mjs` | Static checks: migration names and order, config, keep-alive schedule, pgTAP files |
| `tests/production/*.test.mjs` | The waitlist tests, against **production**, only with `REBLOOM_PROD_TESTS=1` and their own `PROD_SUPABASE_URL` / `PROD_SUPABASE_PUBLISHABLE_KEY`. They use reserved `example.com` addresses that are never stored |
| `functions/delete-account/` | Deletes the caller's account. The user comes only from their own token; the body is never read. 204 also when the user is already gone |
| `scripts/` | SQL-editor checks for the waitlist (run by hand; not part of `test db`) |

`supabase test db` runs every `.sql` file under `tests/` as a pgTAP test, so only pgTAP files go there.

## Rules for every app table

Every table the app syncs follows this template (checked by `tests/database/rls_template.test.sql` and `rls_property.test.sql`):

```sql
create table public.example (
  id uuid primary key,                -- made by the app, so offline rows can sync later
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz              -- soft delete, as in the app's SQLite schema
);
alter table public.example enable row level security;
revoke all on table public.example from anon, authenticated;
grant select, insert, update on table public.example to authenticated;
create policy "owner reads"   on public.example for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts" on public.example for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner updates" on public.example for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index on public.example (user_id) where deleted_at is null;
```

- RLS on, policies `to authenticated` only, and **every** policy checks `(select auth.uid()) = user_id`. Never `using (true)`: anyone can make an account with an email address, so "authenticated" means "anyone".
- No delete grant or policy. Rows are soft-deleted; hard deletes happen only through `on delete cascade` when the user is deleted.
- Grants: revoke everything, then give `authenticated` exactly `select, insert, update`; `anon` gets nothing. Supabase's default grants would otherwise add delete and, before migration `20261104060000_default_privileges`, TRUNCATE (which ignores RLS: one user could empty everyone's rows), TRIGGER, REFERENCES and MAINTAIN. `grants.test.sql` fails if any table gives an API role those four. Column names are `snake_case`.
- Storage buckets are private (`public = false`): a public bucket serves every file by URL with no RLS check, photos and their location metadata included. Paths start with the owner's id (`<user_id>/…`), with the same owner check on `storage.objects`. Storage files are **not** removed by the cascade: whatever deletes a user must remove them too.

## Things that get around row level security

`tests/database/grants.test.sql` fails on each of these:

- **Views** run as their owner, so they skip the table's policies, unless created `with (security_invoker = true)`. Every view the API roles can read must have it.
- **Materialized views and foreign tables** have no row level security at all. Don't grant them to `anon` or `authenticated`; keep them out of `public` or unexposed.
- **Security definer functions** run as their owner. Don't put them in `public`. If one really must be callable (like `join_waitlist`), it checks `auth.uid()` itself, is reviewed, and is added to the allowlist in `grants.test.sql` by full signature (`name(argtypes)`), never by name.

Since migration `20261104060000_default_privileges`, new tables and views give `anon` nothing by default; `authenticated` still gets select/insert/update/delete on them until a table revokes it, which is why the template revokes first.

## Rules for every function

Supabase grants every new function in `public` to `anon` and `authenticated` directly, so `revoke … from public` alone leaves them callable (that's how `ping()` ended up open to signed-in users). Every new function:

```sql
revoke execute on function public.my_function(text) from public, anon, authenticated;
grant execute on function public.my_function(text) to authenticated;  -- only what it needs
```

`tests/database/grants.test.sql` fails if any function in `public` is callable by `anon` other than `ping()` and `join_waitlist(text,text)`, or by `authenticated` other than `join_waitlist(text,text)`. The lists use full signatures, so a new overload doesn't slip through under a known name. Add a new function to them in the same change, on purpose.

Security definer functions: `set search_path = ''` and fully qualified names, as the waitlist functions do.

## Edge Functions

- A function reads its keys from the environment Supabase gives it: `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` (JSON, key `default`; the legacy `SUPABASE_SERVICE_ROLE_KEY` as fallback). Nothing to set by hand, locally or in production. Never put a secret key in the app or the repo.
- `verify_jwt = false` in `config.toml`: the platform's own check only understands the legacy JWT keys. Each function checks the caller itself (`delete-account` asks the Auth server with `auth.getUser(token)`, which refuses API keys and tokens with no user).
- **Auth settings in production are changed in the dashboard, never with `supabase config push`**: it would copy this file's local values (`site_url = "http://127.0.0.1:3000"`, the local redirect list) over production's. Each dashboard change is listed and ticked in its PR.

## Windows

`.gitattributes` keeps `*.sql` files LF. Postgres stores a function body exactly as written, so CRLF would put `\r` into every function and `db diff --remote` would report them all as changed.

## Known difference from production

`db diff --remote` lists `waitlist_normalize_email`: the migration writes the stripped characters as `­`… escapes, production holds the characters themselves. Same behaviour (`grants.test.sql` checks every character); left as escapes on purpose.
