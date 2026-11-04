# Spec: Supabase Foundation

**Created**: 2026-11-03
**Status**: draft
**Author**: Sanket
**Epic**: Cloud backup of plants (step 1 of 3: foundation → accounts → backup)
**Risk**: high (Supabase auth sessions, RLS policies, the shared production project that holds the waitlist)

**Sources**: the live `rebloom` Supabase project (ref `vhxcgmupopeochwvmwcv`, us-east-1, Postgres 17), inspected 2026-11-03: tables, applied migrations, security advisors · Expo SDK 58 guide "Using Supabase" (`docs/pages/guides/using-supabase.mdx` at `expo@58.0.0`) · Supabase docs: Expo React Native quickstart, Anonymous Sign-Ins (read and rejected, see Decisions) · `.planning/specs/scan-diagnosis.md` (Out of scope, Open Questions: phone backups)

---

## Problem

Plants and scans live only in the phone's SQLite database and document folder. A lost, broken or replaced phone loses every plant. We want cloud backup, and the landing page's Supabase project is the place for it. But the app has no Supabase client, no way to keep a signed-in session, no rules for what an app table must look like, and no safe place to try backend changes. Today every backend change goes straight to the production project, which also holds real waitlist sign-ups.

There is also a hidden trap in the existing setup: the migration files in `supabase/migrations/` don't have the same version numbers as the migrations recorded on the live project (local `20261031134500_waitlist.sql`, remote `20261031143232 waitlist`, and the same for all four). The first `supabase db push` would treat all four as new and try to run them again on the production database.

## Goal

The app has one session module that holds the signed-in user's Supabase session, keeps it across restarts, refreshes it, reports changes, and signs out cleanly, including when offline. Nothing signs in yet (the accounts spec adds the sign-in screens), so a normal app start sends no network request and the app works offline exactly as it does today. Backend work happens on a local Supabase stack, and the production project is changed only by pushing reviewed migrations. The migration history matches the live project. Tests against the local stack prove that one user can never read or change another user's rows, and that app users can't touch the waitlist. `typecheck`, `lint`, `test` and the backend tests pass.

## Decisions

- **No anonymous accounts** (2026-11-03). Backup needs a real sign-in to survive a phone change anyway, and anonymous accounts would add orphaned users after uninstalls, a "session lost" state, a per-IP sign-up limit, and merging when an anonymous user signs in to an account that already exists. A user signs in (email code, Google or Apple; see the accounts spec) when they turn on backup. Scanning and My Plants never need an account.
- **Local stack for development** (2026-11-03). Docker is installed, so `supabase start`. No second hosted project.
- **Session storage follows the SDK 58 guide** (2026-11-03): `expo-sqlite` localStorage, inside the app's private storage, not encrypted, included in iCloud / Android Auto Backup. Revisit in the backup spec together with the "phone backups" question from the scan-diagnosis spec.

## User Stories

- As the **developer**, I want one tested place that owns the Supabase session, so the accounts, backup and (later) paywall work don't each invent their own auth handling.
- As the **developer**, I want a local Supabase stack and a migration history that matches production, so I can build and break backend changes without risking the waitlist.
- As the **developer**, I want an RLS template with tests, so every future app table is private by default and a missing policy is caught by a test, not by a user.
- As a **plant owner**, I want the app to keep working offline and not contact any server until I choose a feature that needs it, so "your photo stays on your phone" stays true.

## Requirements

### Must-have

**1. Migration history matches production** (do this first, before any other backend change)
- Read the SQL recorded for each of the four remote migrations and confirm it matches the local file of the same name. If any differ, stop and report the difference.
- When they match, rename the local files to the remote version numbers (`20261031143232_waitlist.sql`, `20261031144424_waitlist_hardening.sql`, `20261031173425_waitlist_swarm_fixes.sql`, `20261031173802_waitlist_trim_order.sql`). Renaming is safer than `supabase migration repair` because the repo then shows what production actually ran.
- `supabase migration list --remote` (the linked production project) shows all four as applied on both sides, and nothing pending.

**2. Local development stack**
- `supabase init` creates `supabase/config.toml` next to the existing `migrations/` and `tests/` folders. Nothing in those folders changes except the renames above, and moving the two SQL-editor scripts (`waitlist_normalize.sql`, `waitlist_storage.sql`) to `supabase/scripts/`, because `supabase test db` runs every `.sql` file under `supabase/tests/` as a pgTAP test.
- `config.toml`: anonymous sign-ins off; phone provider off; email provider on with sign-in by 6-digit code (the local stack's mail catcher receives the emails, so tests can sign in). The accounts spec owns the production provider settings.
- `supabase start` runs every migration from an empty database with no errors, and `supabase db reset` does the same again.
- `app/.env.example` (committed) lists `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with comments. `app/.env.local` (already gitignored) holds the local stack's values. For a phone on the local stack, the URL is the computer's LAN address (`http://192.168.x.x:54321`), not `localhost`.
- `app/README.md` and the root `CLAUDE.md` get a short "Backend" section: how to start the stack, where migrations go, and the rule that production only changes through `supabase db push` of reviewed migrations.

**3. Rules for every app table and function** (written into `supabase/README.md` and enforced by tests)
- Every app table has: `id uuid primary key` (made by the app so offline rows can sync later), `user_id uuid not null default auth.uid() references auth.users (id) on delete cascade`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `deleted_at timestamptz` (soft delete, same as the local schema). Column names are `snake_case`.
- RLS is on, with policies `to authenticated` only, and every policy checks `(select auth.uid()) = user_id` in both `using` and `with check`. A policy that is `using (true)` for `authenticated` is never allowed: anyone can make an account with an email address, so "authenticated" means "anyone", not "a trusted person".
- `anon` gets no grants on app tables. Every new function revokes `execute` from `public, anon, authenticated` and then grants only what it needs (Supabase grants new functions to `anon` and `authenticated` by default, so revoking from `public` alone isn't enough; that's how `ping()` ended up callable by signed-in users, see 4).
- Storage paths, when buckets arrive, start with the owner's id (`<user_id>/...`), with the same owner check on `storage.objects`.

**4. Production project fixes** (one new migration)
- Revoke `execute` on `public.ping()` from `authenticated` (the security advisor flags it; the migration meant it for `anon` only). The keep-alive job uses the publishable key as `anon`, so it keeps working.
- `join_waitlist()` stays callable by `anon` and `authenticated`. That was intended: a signed-in app user calling it is no different from a visitor.
- Remove TRUNCATE, REFERENCES, TRIGGER and MAINTAIN from the default grants `anon` and `authenticated` get on new `public` tables (break-test finding 2, 2026-11-04): TRUNCATE ignores RLS, so one signed-in user could empty a table. The template also grants only `select, insert, update`.
- Refuse password sign-ups with a trigger on `auth.users` (adversarial review finding 1, 2026-11-04): Rebloom never uses passwords, and a password sign-up made with someone else's email would let its maker into that person's account once they sign in by code. Local `config.toml` also turns email confirmation on, as on hosted projects.
- No other change to the waitlist table, its functions or the keep-alive workflow.

**5. App client** (`app/src/backend/`)
- Packages: `@supabase/supabase-js`, installed with `npx expo install`. The session is stored with `expo-sqlite/localStorage/install`, as the SDK 58 guide does. `expo-sqlite` is already installed and in the config plugins, so there's no new native module. No `react-native-url-polyfill` (the SDK 58 guide says Expo already provides `URL`).
- `config.ts`: reads the two `EXPO_PUBLIC_` variables. The backend counts as configured only if both are present and the URL is `https://` (plain `http://` is allowed only in development builds, `__DEV__`). Not configured → every backend call returns `not_configured`; the app never crashes over it.
- `supabase.ts`: makes the client lazily, on the first `getSupabase()` call, never at import time. Options as in the SDK 58 guide (`storage: localStorage`, `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`) plus `flowType: 'pkce'`, which the accounts spec needs for Google and Apple browser sign-in. The `AppState` listener from the guide (`startAutoRefresh` when active, `stopAutoRefresh` otherwise) is added when the client is made.
- `session.ts`, the only module that reads or changes the session:
  - `getSession()`: the stored session or `null`, from local storage. It makes a request only when the stored access token has expired (supabase-js refreshes it then), and answers within 10 seconds: offline, it returns `offline` and keeps the session (supabase-js would otherwise retry for about 30 seconds).
  - `getCurrentUser()`: `{ id, email, provider }` or `null`, from the stored session.
  - `onSessionChange(listener)`: called on sign-in, sign-out, refresh and expiry; returns an unsubscribe function.
  - `setSessionFromAuth(result)`: the single entry point the accounts spec's sign-in methods hand their result to, so storage and listeners behave the same for every method.
  - `signOut()`: always clears the session on the phone, even offline or when the server call fails (it then reports `offline` but the phone is signed out). It never touches plants, scans or photos on the phone.
  - A refresh the server rejects (user deleted, token revoked) → signed out with reason `session_expired`, so the UI can say "Sign in again". Nothing on the phone is deleted.
  - Errors map to a closed set: `not_configured`, `offline`, `rate_limited` (HTTP 429), `session_expired`, `unknown`. Raw Supabase error text is never shown to users.
- Nothing in `src/app/`, the scan flow or My Plants imports `src/backend/` in this spec. A test enforces it, so a normal app start makes zero network requests. (The accounts spec lifts this for its own screens only.)

**6. Production project in this spec**
- Anonymous sign-ins: off (check it's off, it's off by default). Every other auth setting is left alone here and set by the accounts spec, which also owns custom SMTP. `auth.users` has 0 rows today.

### Nice-to-have
- `supabase gen types typescript --local` writes `app/src/backend/database.types.ts`, and the client is typed with it.
- A GitHub Actions job that runs `supabase start` and the backend tests on PRs that touch `supabase/` or `app/src/backend/`.

### Out of scope (each gets its own spec)
- **Sign-in and accounts** (`.planning/specs/accounts.md`): email code, Google, Apple, the sign-in screens, account deletion, custom SMTP, production provider settings and redirect URLs.
- **Cloud backup** itself: plant/scan tables, the photo bucket, upload and restore, the Settings "Backup" screen. Carry over from the break-test (finding 8): the template lets the app set `created_at` and `updated_at` to anything, and sync will rely on `updated_at`; decide there whether the server sets them (a trigger) or sync tolerates a wrong phone clock.
- Privacy policy for the app and store data-safety labels (accounts spec).
- A second hosted Supabase project, Supabase branching, EAS environment variables.
- Feedback upload, the Gemini second look, RevenueCat.

## Data Model

No app tables in this spec. One migration:

```sql
-- ping() is for the keep-alive job, which calls it as anon. Supabase's default grants also gave it to
-- authenticated; app users don't need it.
revoke execute on function public.ping() from authenticated;
```

The table template the backup spec will copy (documented in `supabase/README.md`, exercised by the RLS test on a test-only table that is created and dropped inside the test transaction):

```sql
create table public.example (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.example enable row level security;
revoke all on table public.example from anon;
create policy "owner reads"   on public.example for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts" on public.example for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner updates" on public.example for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index on public.example (user_id) where deleted_at is null;
```

No `delete` policy: rows are soft-deleted, and hard deletes happen only through `on delete cascade` when the user is deleted.

## API Changes

- No new endpoints or functions.
- `ping()` is no longer callable by `authenticated` (it still works for `anon`, which is all the keep-alive job uses).

## UI Changes

None. No screen imports the backend in this spec.

## Edge Cases

1. **Remote migrations don't match the local files.** Stop before renaming or pushing, and report the difference. Never "fix" production to match the repo.
2. **Env missing or wrong** (no `.env.local`, empty key, `http://` URL in a release build): backend counts as not configured, every call returns `not_configured`, and the app runs as today.
3. **Sign out while offline**: the phone is signed out at once; the server session expires on its own. Plants on the phone are untouched.
4. **Refresh rejected** (user deleted on another device, token revoked): signed out with `session_expired`; listeners hear it once, not on every retry.
5. **Token expires while the app is in the background**: auto-refresh stops in the background and starts on return; the first request after return uses a refreshed token. An expired token while offline keeps the stored session and refreshes once online; being offline is never treated as `session_expired`.
5b. **Refresh rate-limited (429) after the access token expired**: supabase-js 2.118 removes the stored session for any refresh error except network failures and 5xx, so this signs the phone out; reported as `session_expired`. Found while building (2026-11-03); accepted, since the refresh limit is per IP and generous. Revisit if users report surprise sign-outs.
6. **Phone clock wrong**: Supabase checks tokens with the server's clock, so a skewed phone clock must not sign the user out or loop refreshing. Device-check item.
7. **App data wiped or app reinstalled**: no stored session, so signed out. The user signs in again (accounts spec) and gets the same account.
8. **Signed-in user reaches the waitlist**: `select`, `insert`, `update` and `delete` on `public.waitlist` are refused; `join_waitlist()` still behaves as it does for visitors.
9. **Another user's id in a request**: a signed-in user who sends someone else's `user_id` on insert, or filters by it on select/update, gets nothing back or an RLS error, never the other user's row.
10. **Backend test pointed at production**: the new tests refuse to run unless `SUPABASE_URL` is a local address, so they can never make users in production. (The waitlist tests against production moved to `supabase/tests/production/` and run only with `REBLOOM_PROD_TESTS=1`, with their own `PROD_SUPABASE_URL`.)
11. **Phone on the local stack**: the phone can't reach `localhost`; the README says to use the LAN address. Release builds refuse `http://` (edge case 2).

## Testing Criteria

Written test-first. App logic in Jest with the Supabase client mocked at the module boundary; database rules and auth against the local stack (`supabase start`), where tests sign users in with an email code read from the local mail catcher or created through the local admin API (the local service key lives only in the test environment, never in the app); RLS property tests with `fast-check`.

### Happy path
- [ ] All four migrations: local file SQL equals the SQL recorded on the remote project (checked once, result noted in the PR); `supabase migration list` shows no mismatch.
- [ ] `supabase db reset` on the local stack applies every migration with no errors.
- [ ] `config.ts`: both vars present + `https://` → configured; missing either → not configured.
- [ ] `setSessionFromAuth` stores the session and `onSessionChange` listeners hear `signed_in`; `getCurrentUser` returns the id, email and provider.
- [ ] Session survives a restart: a fresh client over the same storage returns the same user without a network call.
- [ ] `signOut` clears the session and listeners hear `signed_out`.
- [ ] Local stack: a user signed in by email code can use their token for an RLS-protected request.
- [ ] RLS template: user A inserts, reads, updates and soft-deletes their own row.
- [ ] `ping()` still answers for `anon`; `join_waitlist()` still accepts a valid `example.com` email (existing tests still pass).
- [ ] `npm run typecheck`, `npm run lint`, `npm test` in `app/`, and `node --test "supabase/tests/*.test.mjs"` (static, no network) all pass.

### Edge cases
- [ ] `signOut` while the server call rejects with a network error → the session is cleared anyway and the result is `offline`.
- [ ] A refresh rejected by the server → signed out with `session_expired`, listener called once.
- [ ] A refresh that fails with a network error → still signed in, no `session_expired`.
- [ ] HTTP 429 on a sign-in or other call → `rate_limited`; a 429 on the refresh of an expired token → signed out with `session_expired` (edge case 5b).
- [ ] Offline with an expired token: `getSession()` answers `offline` within 10 seconds and the session is kept.
- [ ] Release-mode config with an `http://` URL → not configured.
- [ ] Importing `src/backend/session.ts` makes no client and no request until a function is called (fetch mock not called).
- [ ] App start (root layout render, the existing tests) → fetch mock never called; no file under `src/app/`, `src/scan/`, `src/plants/` or `src/storage/` imports `src/backend/` (grep test, like the no-hex test).
- [ ] The `AppState` listener: `active` → `startAutoRefresh`; `background` → `stopAutoRefresh`.
- [ ] Local stack: anonymous sign-in is refused.
- [ ] Local stack: a signed-in user can't `select`, `insert`, `update` or `delete` on `public.waitlist`.
- [ ] Local stack: `authenticated` can't execute `ping()`; `anon` can.
- [ ] Property test (fast-check, local stack, test-only table): for random sets of 2–5 users and random rows, every user's `select` returns only their own rows; inserting with another user's `user_id` fails; updating or soft-deleting another user's row changes 0 rows; changing `user_id` on your own row to someone else's fails.
- [ ] Deleting a user from `auth.users` removes their rows (cascade) and nobody else's.
- [ ] The backend tests exit with a clear message, and make no request, when `SUPABASE_URL` isn't local.
- [ ] Device checks (added to the `.handoff/` device checklist): the Android phone against the local stack over LAN; session kept after force-quit; return from a long background refreshes the token; wrong phone clock.

### After the build (break-test protocol)
- Break-test report before fixes, then the adversarial swarm is offered (high risk), and Sanket reads the diff before merge. The migration push to production happens only after that, as its own step, with `supabase migration list` checked before and after.

## Dependencies

- Supabase CLI and Docker on Sanket's machine (Docker installed).
- Access to the `rebloom` project to link the CLI (`supabase link --project-ref vhxcgmupopeochwvmwcv`).
- npm: `@supabase/supabase-js` (via `npx expo install`). Already installed: `expo-sqlite`, `fast-check`.
- No dev build needed for this spec: everything used ships in Expo Go 58. (The accounts spec needs one for Google and Apple.)
- Every Expo API used is checked against the SDK 58 docs. `docs.expo.dev` is blocked in the cloud session, so the guide was read from the Expo repo at `expo@58.0.0`. Re-check it from a machine that can reach the site before building.

## Open Questions

None left for this spec. Decided items are under Decisions.

---

## Gate 1

**Completeness**
- [x] Problem is clearly stated (no session handling, no safe dev setup, migration history mismatch)
- [x] Goal is specific and measurable (session module behavior, zero requests on start, history matches, RLS tests pass)
- [x] At least one user story (4)
- [x] Requirements split into must-have, nice-to-have, out of scope
- [x] Out of scope section exists

**Data Model**
- [x] No new app tables; the table template has standard columns (`id`, `user_id`, `created_at`, `updated_at`, `deleted_at`)
- [x] Column types are correct (`uuid`, `timestamptz`)
- [x] Soft delete strategy is defined (`deleted_at`, no delete policy, cascade on user delete)
- [x] RLS on every table, owner check in every policy, `anon` revoked

**API Design**
- [x] No new endpoints; one grant change (`ping()`), existing waitlist API unchanged

**Quality**
- [x] Edge cases listed (11)
- [x] Testing criteria for happy path
- [x] Testing criteria for edge cases, including property tests (high risk)
- [x] Dependencies listed
- [x] Risk rated: high

**Result: PASSED**
