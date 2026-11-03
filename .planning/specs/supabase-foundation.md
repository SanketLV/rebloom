# Spec: Supabase Foundation

**Created**: 2026-11-03
**Status**: draft
**Author**: Sanket
**Epic**: Cloud backup of plants (this spec is step 1; the backup spec builds on it)
**Risk**: high (Supabase auth, RLS policies, the shared production project that holds the waitlist)

**Sources**: the live `rebloom` Supabase project (ref `vhxcgmupopeochwvmwcv`, us-east-1, Postgres 17), inspected 2026-11-03: tables, applied migrations, security advisors · Expo SDK 58 guide "Using Supabase" (`docs/pages/guides/using-supabase.mdx` at `expo@58.0.0`) · Supabase docs "Anonymous Sign-Ins" and the Expo React Native quickstart · `.planning/specs/scan-diagnosis.md` (Out of scope, Open Questions: phone backups)

---

## Problem

Plants and scans live only in the phone's SQLite database and document folder. A lost, broken or replaced phone loses every plant. We want cloud backup, and the landing page's Supabase project is the place for it, but the app has no Supabase client, no way to give a user an identity, no rules for what an app table must look like, and no safe place to try backend changes. Today every backend change goes straight to the production project, which also holds real waitlist sign-ups.

There is also a hidden trap in the existing setup: the migration files in `supabase/migrations/` don't have the same version numbers as the migrations recorded on the live project (local `20261031134500_waitlist.sql`, remote `20261031143232 waitlist`, and the same for all four). The first `supabase db push` would treat all four as new and try to run them again on the production database.

## Goal

The app can get a Supabase session for the current install (an anonymous user, no email or password) through one function, `ensureSession()`, that keeps the session across restarts and never makes two users for one install. Nothing in the app calls it yet, so a normal app start sends no network request and the app works offline exactly as it does today. Backend work happens on a local Supabase stack, and the production project is changed only by pushing reviewed migrations. The migration history matches the live project. Tests against the local stack prove that one user can never read or change another user's rows, and that app users can't touch the waitlist. `typecheck`, `lint`, `test` and the backend tests pass.

## User Stories

- As the **developer**, I want one tested way to get a signed-in Supabase client, so the backup feature (and later the paywall and feedback upload) doesn't each invent its own auth handling.
- As the **developer**, I want a local Supabase stack and a migration history that matches production, so I can build and break backend changes without risking the waitlist.
- As the **developer**, I want an RLS template with tests, so every future app table is private by default and a missing policy is caught by a test, not by a user.
- As a **plant owner**, I want the app to keep working offline and not contact any server until I turn on a feature that needs it, so "your photo stays on your phone" stays true.

## Requirements

### Must-have

**1. Migration history matches production** (do this first, before any other backend change)
- Read the SQL recorded for each of the four remote migrations and confirm it matches the local file of the same name. If any differ, stop and report the difference.
- When they match, rename the local files to the remote version numbers (`20261031143232_waitlist.sql`, `20261031144424_waitlist_hardening.sql`, `20261031173425_waitlist_swarm_fixes.sql`, `20261031173802_waitlist_trim_order.sql`). Renaming is safer than `supabase migration repair` because the repo then shows what production actually ran.
- `supabase migration list` (linked to production) shows all four as applied on both sides, and nothing pending.

**2. Local development stack**
- `supabase init` creates `supabase/config.toml` next to the existing `migrations/` and `tests/` folders. Nothing in those folders changes except the renames above.
- `config.toml` sets: anonymous sign-ins on; the email and phone providers off (nobody can make an email/password account against the project until an account spec decides how); manual identity linking off for now. These are the settings the production project gets too (see 6).
- `supabase start` runs every migration from an empty database with no errors, and `supabase db reset` does the same again.
- `app/.env.example` (committed) lists `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with comments. `app/.env.local` (already gitignored) holds the local stack's values. For a phone running Expo Go, the URL is the computer's LAN address (`http://192.168.x.x:54321`), not `localhost`.
- `app/README.md` and the root `CLAUDE.md` get a short "Backend" section: how to start the stack, where migrations go, and the rule that production only changes through `supabase db push` of reviewed migrations.

**3. Rules for every app table and function** (written into `supabase/README.md` and enforced by tests)
- Every app table has: `id uuid primary key` (made by the app so offline rows can sync later), `user_id uuid not null default auth.uid() references auth.users (id) on delete cascade`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `deleted_at timestamptz` (soft delete, same as the local schema). Column names are `snake_case`.
- RLS is on, with policies `to authenticated` only, and every policy checks `(select auth.uid()) = user_id` in both `using` and `with check`. A policy that is `using (true)` for `authenticated` is never allowed: anyone holding the public key can make an anonymous user, so "authenticated" means "anyone", not "a trusted person".
- `anon` gets no grants on app tables. Every new function revokes `execute` from `public, anon, authenticated` and then grants only what it needs (Supabase grants new functions to `anon` and `authenticated` by default, so revoking from `public` alone isn't enough; that's how `ping()` ended up callable by signed-in users, see 4).
- Storage paths, when buckets arrive, start with the owner's id (`<user_id>/...`), with the same owner check on `storage.objects`.

**4. Production project fixes** (one new migration)
- Revoke `execute` on `public.ping()` from `authenticated` (the security advisor flags it; the migration meant it for `anon` only). The keep-alive job uses the publishable key as `anon`, so it keeps working.
- `join_waitlist()` stays callable by `anon` and `authenticated`. That was intended: an app user calling it is no different from a visitor.
- No other change to the waitlist table, its functions or the keep-alive workflow.

**5. App client** (`app/src/backend/`)
- Packages: `@supabase/supabase-js`, installed with `npx expo install`. The session is stored with `expo-sqlite/localStorage/install`, as the SDK 58 guide does. `expo-sqlite` is already installed and in the config plugins, so there's no new native module and Expo Go 58 still works. No `react-native-url-polyfill` (the SDK 58 guide says Expo already provides `URL`).
- `config.ts`: reads the two `EXPO_PUBLIC_` variables. The backend counts as configured only if both are present and the URL is `https://` (plain `http://` is allowed only in development builds, `__DEV__`). Not configured → every backend call returns `not_configured`; the app never crashes over it.
- `supabase.ts`: makes the client lazily, on the first `getSupabase()` call, never at import time. Options as in the SDK 58 guide: `storage: localStorage`, `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`. The `AppState` listener from the guide (`startAutoRefresh` when active, `stopAutoRefresh` otherwise) is added when the client is made and removed if it's ever torn down (tests).
- `session.ts`: `ensureSession(): Promise<SessionResult>`:
  - A stored, valid session → return it (no sign-in call).
  - No stored session and this install never had one → `signInAnonymously()`, store it, return it.
  - Concurrent calls share one in-flight promise, so one install makes at most one anonymous user.
  - This install had a session before and it's now gone or rejected (user deleted, refresh token revoked) → return `session_lost`, and **don't** silently make a new user. A fresh empty account would look like lost backups; the backup spec decides what the user sees. A small marker in the same storage (`rebloom.backend.had_session`) records that a session existed.
  - Errors map to a closed set: `not_configured`, `offline`, `rate_limited` (HTTP 429), `session_lost`, `unknown`. Raw Supabase error text is never shown to users.
- `getCurrentUserId()` reads the stored session only, with no network call.
- Nothing in `src/app/`, the scan flow or My Plants imports `src/backend/` in this spec. A test enforces it, so a normal app start makes zero network requests.

**6. Production auth settings** (changed by Sanket in the dashboard, mirrored in `config.toml`; checked off in the PR)
- Anonymous sign-ins: on.
- Email and phone providers: off. (`auth.users` has 0 rows today, so nothing is lost.)
- Anonymous sign-in rate limit: keep the default 30 per hour per IP for now (see Open Questions).
- No redirect URLs yet: anonymous sign-in uses no links. `rebloom://` gets added by whichever spec first sends an email link.

### Nice-to-have
- `supabase gen types typescript --local` writes `app/src/backend/database.types.ts`, and the client is typed with it.
- A GitHub Actions job that runs `supabase start` and the backend tests on PRs that touch `supabase/` or `app/src/backend/`.

### Out of scope (each gets its own spec)
- **Cloud backup itself**: plant/scan tables, the photo bucket, upload and restore, the Settings "Backup" screen. This is the next spec.
- **Account deletion** (Apple requires it once an account exists, and the review rules need a cleanup path for every stored file). Not needed here because no production code path makes an account yet, but **the backup spec must ship deletion of the user, their rows and their photo files before the first upload**.
- **Cleanup of abandoned anonymous users** (an app uninstall leaves the user behind; Supabase has no automatic cleanup). The backup spec decides the policy, since deleting a user with backups is data loss.
- Permanent sign-in (email code, Sign in with Apple / Google) and linking it to the anonymous user. Without it, a backup only survives a phone change if the phone's own backup restores the session (see Open Questions).
- CAPTCHA on anonymous sign-in (needs an in-app web view on mobile).
- Privacy policy for the app, App Store / Play data-safety labels, and copy changes to "Scans run on your phone": nothing leaves the phone in this spec, so they move to the backup spec.
- A second hosted Supabase project for staging, Supabase branching, EAS environment variables. EAS builds don't exist yet.
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

- No new endpoints or functions. The app uses Supabase Auth's anonymous sign-in and token refresh only.
- `ping()` is no longer callable by `authenticated` (it still works for `anon`, which is all the keep-alive job uses).

## UI Changes

None. No screen imports the backend in this spec.

## Edge Cases

1. **Remote migrations don't match the local files.** Stop before renaming or pushing, and report the difference. Never "fix" production to match the repo.
2. **Env missing or wrong** (no `.env.local`, empty key, `http://` URL in a release build): backend counts as not configured, `ensureSession` returns `not_configured`, and the app runs as today.
3. **Offline or server down while signing in**: `offline` (or `unknown` for a 5xx), no user stored, the next call tries again.
4. **Double call** (two features or a double tap call `ensureSession` at once): one sign-in request, one user, both callers get the same session.
5. **App killed between the server making the user and the session being stored**: an orphan anonymous user with no data on the server; the next call makes a new one. Accepted; the anonymous-user cleanup decided in the backup spec covers it.
6. **Session lost after it existed** (user deleted on the server, refresh token revoked, storage cleared but the marker survived): `session_lost`, no silent new account.
7. **Storage cleared completely** (app data wiped, reinstall): there's no marker, so it counts as a new install and gets a new anonymous user. Any old backups are unreachable without permanent sign-in (Open Questions).
8. **Rate limited** (30 anonymous sign-ins per IP per hour; mobile carriers put many phones behind one IP): `rate_limited`, nothing stored, retry later.
9. **Token expires while the app is in the background**: auto-refresh stops in the background and starts on return; the first request after return uses a refreshed token. An expired token while offline keeps the stored session and refreshes once online.
10. **Phone clock wrong**: Supabase checks tokens with the server's clock, so a skewed phone clock must not log the user out or loop refreshing. Device-check item.
11. **App user reaches the waitlist**: an anonymous user's `select` on `public.waitlist` is refused, and `insert`/`update`/`delete` are refused; `join_waitlist()` still behaves as it does for visitors.
12. **Another user's id in a request**: a signed-in user who sends `user_id` of someone else on insert, or filters by it on select/update, gets nothing back or an RLS error, never the other user's row.
13. **Backend test pointed at production**: the new auth tests refuse to run unless `SUPABASE_URL` is a local address, so they can never make anonymous users in production. (The existing waitlist tests keep running against production, as today.)
14. **Expo Go on a phone with the local stack**: the phone can't reach `localhost`; the README says to use the LAN address. Cleartext `http://` to a LAN address works in Expo Go; release builds refuse it (edge case 2).

## Testing Criteria

Written test-first. App logic in Jest with the Supabase client mocked at the module boundary; database rules and auth against the local stack (`supabase start`); RLS property tests with `fast-check`.

### Happy path
- [ ] All four migrations: local file SQL equals the SQL recorded on the remote project (checked once, result noted in the PR); `supabase migration list` shows no mismatch.
- [ ] `supabase db reset` on the local stack applies every migration with no errors.
- [ ] `config.ts`: both vars present + `https://` → configured; missing either → not configured.
- [ ] `ensureSession`: no stored session → calls `signInAnonymously` once and returns the session; a second call returns the stored session with no sign-in call.
- [ ] Session survives a restart: a fresh client over the same storage returns the same user id without a network call.
- [ ] Local stack: `signInAnonymously` returns a user with `is_anonymous = true`, and its token works for an RLS-protected request.
- [ ] RLS template: user A inserts, reads, updates and soft-deletes their own row.
- [ ] `ping()` still answers for `anon`; `join_waitlist()` still accepts a valid `example.com` email (existing tests still pass).
- [ ] `npm run typecheck`, `npm run lint`, `npm test` in `app/`, and `node --test "supabase/tests/*.test.mjs"` all pass.

### Edge cases
- [ ] Two concurrent `ensureSession` calls → exactly one `signInAnonymously` call, same user id for both.
- [ ] `signInAnonymously` rejects with a network error → `offline`, nothing stored; the next call tries again.
- [ ] HTTP 429 → `rate_limited`.
- [ ] Marker set, session gone or refresh rejected → `session_lost`, and `signInAnonymously` is **not** called.
- [ ] Release-mode config with an `http://` URL → not configured.
- [ ] Importing `src/backend/session.ts` makes no client and no request until `ensureSession` is called (fetch mock not called).
- [ ] App start (root layout render, the existing tests) → fetch mock never called; no file under `src/app/`, `src/scan/`, `src/plants/` or `src/storage/` imports `src/backend/` (grep test, like the no-hex test).
- [ ] The `AppState` listener: `active` → `startAutoRefresh`; `background` → `stopAutoRefresh`.
- [ ] Local stack: an anonymous user can't `select`, `insert`, `update` or `delete` on `public.waitlist`.
- [ ] Local stack: `authenticated` can't execute `ping()`; `anon` can.
- [ ] Property test (fast-check, local stack, test-only table): for random sets of 2–5 users and random rows, every user's `select` returns only their own rows; inserting with another user's `user_id` fails; updating or soft-deleting another user's row changes 0 rows; changing `user_id` on your own row to someone else's fails.
- [ ] Deleting a user from `auth.users` removes their rows (cascade) and nobody else's.
- [ ] The auth tests exit with a clear message, and make no request, when `SUPABASE_URL` isn't local.
- [ ] Device checks (added to `.handoff/` device checklist): Expo Go on the Android phone against the local stack over LAN; session kept after force-quit; return from a long background refreshes the token; wrong phone clock.

### After the build (break-test protocol)
- Break-test report before fixes, then the adversarial swarm is offered (high risk), and Sanket reads the diff before merge. The migration push to production happens only after that, as its own step, with `supabase migration list` checked before and after.

## Dependencies

- Supabase CLI on Sanket's machine, and Docker (installed) for `supabase start`.
- Access to the `rebloom` project to link the CLI (`supabase link --project-ref vhxcgmupopeochwvmwcv`) and change the auth settings in the dashboard.
- npm: `@supabase/supabase-js` (via `npx expo install`). Already installed: `expo-sqlite`, `fast-check`.
- No dev build: everything used ships in Expo Go 58.
- Every Expo API used is checked against the SDK 58 docs. `docs.expo.dev` is blocked in the cloud session, so the guide was read from the Expo repo at `expo@58.0.0`. Re-check it from a machine that can reach the site before building.

## Open Questions

- ~~Docker on your machine?~~ **Decided 2026-11-03:** Docker is installed, so development uses the local stack (`supabase start`). No `rebloom-dev` project.
- ~~Session storage: plain or encrypted?~~ **Decided 2026-11-03:** follow the SDK 58 guide (`expo-sqlite` localStorage: inside the app's private storage, not encrypted, included in iCloud / Android Auto Backup). Revisit in the backup spec together with the "phone backups" question from the scan-diagnosis spec.
- **Permanent sign-in for backup.** An anonymous account can't be recovered on a new phone unless the OS backup restores the session. For backup to be worth having, the backup spec probably needs email-code sign-in (or Apple / Google) to link the account. Decide there.
- **Rate limit.** 30 anonymous sign-ins per IP per hour may block real users behind a shared carrier IP once there are many users. Fine at launch scale because sign-in happens only when backup is turned on, not at every app start; revisit before a marketing push.

---

## Gate 1

**Completeness**
- [x] Problem is clearly stated (no identity, no safe dev setup, migration history mismatch)
- [x] Goal is specific and measurable (`ensureSession` behavior, zero requests on start, history matches, RLS tests pass)
- [x] At least one user story (4)
- [x] Requirements split into must-have, nice-to-have, out of scope
- [x] Out of scope section exists, including what the backup spec must ship first

**Data Model**
- [x] No new app tables; the table template has standard columns (`id`, `user_id`, `created_at`, `updated_at`, `deleted_at`)
- [x] Column types are correct (`uuid`, `timestamptz`)
- [x] Soft delete strategy is defined (`deleted_at`, no delete policy, cascade on user delete)
- [x] RLS on every table, owner check in every policy, `anon` revoked

**API Design**
- [x] No new endpoints; one grant change (`ping()`), existing waitlist API unchanged

**Quality**
- [x] Edge cases listed (14)
- [x] Testing criteria for happy path
- [x] Testing criteria for edge cases, including property tests (high risk)
- [x] Dependencies listed
- [x] Risk rated: high

**Result: PASSED**
