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
| Static checks + production waitlist tests | `node --test "supabase/tests/*.test.mjs"` |
| Connect the CLI to production (once per machine) | `npx -y supabase@3 login`, then `npx -y supabase@3 link --project-ref vhxcgmupopeochwvmwcv` |
| Compare production with the migrations | `npx -y supabase@3 migration list --remote`, `npx -y supabase@3 db diff --remote` |
| Ship reviewed migrations | `npx -y supabase@3 db push --remote --dry-run`, then without `--dry-run` |

Local services: API `http://127.0.0.1:54321`, database `127.0.0.1:54322`, Mailpit (catches every auth email) `http://127.0.0.1:54324`. A phone running the app reaches the stack through this computer's LAN address, not `localhost` (see `app/README.md`).

## What's here

| Path | What |
|---|---|
| `config.toml` | Local stack settings: no anonymous accounts, no SMS, email sign-in by 6-digit code (10 min), seed off |
| `templates/sign_in_code.html` | The sign-in email: the code only, no link |
| `migrations/` | Every schema change, in order. The first four are the waitlist and keep the version numbers production recorded |
| `tests/database/*.test.sql` | pgTAP: grants, the RLS template, a seeded random RLS property test |
| `tests/local/*.test.mjs` | Through the local API. A guard refuses any non-local address before the first request |
| `tests/*.test.mjs` | Static checks (migration names, config) and the waitlist tests, which run against **production** with reserved `example.com` addresses that are never stored |
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
revoke all on table public.example from anon;
create policy "owner reads"   on public.example for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts" on public.example for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner updates" on public.example for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index on public.example (user_id) where deleted_at is null;
```

- RLS on, policies `to authenticated` only, and **every** policy checks `(select auth.uid()) = user_id`. Never `using (true)`: anyone can make an account with an email address, so "authenticated" means "anyone".
- No delete policy. Rows are soft-deleted; hard deletes happen only through `on delete cascade` when the user is deleted.
- `anon` gets nothing. Column names are `snake_case`.
- Storage paths start with the owner's id (`<user_id>/…`), with the same owner check on `storage.objects`. Storage files are **not** removed by the cascade: whatever deletes a user must remove them too.

## Rules for every function

Supabase grants every new function in `public` to `anon` and `authenticated` directly, so `revoke … from public` alone leaves them callable (that's how `ping()` ended up open to signed-in users). Every new function:

```sql
revoke execute on function public.my_function(text) from public, anon, authenticated;
grant execute on function public.my_function(text) to authenticated;  -- only what it needs
```

`tests/database/grants.test.sql` fails if any function in `public` is callable by `anon` other than `ping` and `join_waitlist`, or by `authenticated` other than `join_waitlist`. Add a new function to that list in the same change, on purpose.

Security definer functions: `set search_path = ''` and fully qualified names, as the waitlist functions do.

## Windows

`.gitattributes` keeps `*.sql` files LF. Postgres stores a function body exactly as written, so CRLF would put `\r` into every function and `db diff --remote` would report them all as changed.

## Known difference from production

`db diff --remote` lists `waitlist_normalize_email`: the migration writes the stripped characters as `­`… escapes, production holds the characters themselves. Same behaviour (`grants.test.sql` checks every character); left as escapes on purpose.
