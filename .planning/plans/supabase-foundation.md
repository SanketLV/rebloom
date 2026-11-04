# Plan: Supabase Foundation

**Spec**: .planning/specs/supabase-foundation.md
**Epic**: Cloud backup of plants (step 1 of 3)
**Created**: 2026-11-03
**Status**: draft
**Risk**: high

**Build notes (tasks 7–13, 2026-11-03)**: `npx expo install` can't reach the Expo API from the cloud session (proxy 403), so supabase-js was installed with `EXPO_OFFLINE=1 npx expo install @supabase/supabase-js` (same result: the SDK doesn't pin it). The spike passed: the session tests run the real supabase-js against `src/testing/fakeAuthServer.ts`. The full app suite has flaky route-rendering tests that fail 1–5 per run before and after this work (each file passes alone); tracked as a separate task.

**Task 1 result (2026-11-04, run by Sanket on Windows)**: renamed (commit `61cbebc`). `migration list --remote` shows the four versions on both sides. `db diff --remote` (pg-delta and migra) first listed all four waitlist functions: the Windows checkout had CRLF line endings, so every function body in the shadow database held `\r`. Fixed with `.gitattributes` (`*.sql text eol=lf`, commit `8005d60`). After re-checkout with LF, the only difference left is `waitlist_normalize_email`: the migration spells the stripped characters as `\u00AD`… escapes, production holds the characters themselves (the SQL was applied with the escapes already decoded). Same behaviour; kept as escapes because invisible literals in source are unreadable. T3 adds a local test that the escaped version strips every listed character. `drop extension pg_net` in migra's output is the local image's extension (not installed in production); ignored.

**Tasks 2–6 (2026-11-04)**: done in the cloud session. Docker there can't pull Supabase images (the proxy blocks their CDN), so the pgTAP files were run on a local Postgres 16 with pgTAP and a stub of the Supabase roles (`anon`, `authenticated`, `service_role`), `auth.users`, `auth.uid()` and Supabase's default grants on `public`. The stub reproduced the advisor's `ping()` finding before the fix. Results: grants 18/18 (3 failed before the migration), template 13/13 (6 fail with `using (true)` policies), property 3/3 (fails with `using (true)`; 321 rows over the 20 rounds). Final check is `supabase test db` on the real local stack. `[db.seed]` is off until there is seed data.

**Tasks 14–15 (2026-11-04)**: local API tests 7/7 on Sanket's machine (one test bug found on the first run: the status assertion's message consumed the response body; fixed). Docs written: `supabase/README.md`, Backend sections in `app/README.md` and `CLAUDE.md`, `.handoff/device-checklist.md`. Full run: typecheck and lint clean; app tests 388/391 with the 3 failures in the known flaky route-rendering set; static Supabase checks 10/10; on Sanket's machine `supabase test db` 34/34, `supabase/tests/*.test.mjs` 29/29, local API 7/7. Left: break-test, swarm offer, Sanket's read of the diff, then task 16.

**Break-test (2026-11-04)**: 8 findings, reported before fixing. Fixed 1–7 test-first (offline sign-out kept the session; API roles had TRUNCATE on new tables, now removed by migration `20261104060000_default_privileges`; a throwing listener broke sign-in; storage failures threw; a malformed URL crashed the client; account switch had no signed_out; the import guard missed new folders). Finding 8 (client-set timestamps) moved to the backup spec. On Sanket's machine after the fixes: `supabase test db` 38/38, local API 7/7. Left: adversarial review (offered), Sanket's read of the diff, task 16.

**Adversarial review, round 2 (2026-11-04)**: three reviewers (database, session logic, tests/docs), 16 findings after merging duplicates; all fixed test-first. Highlights: passwords cleared when an address is confirmed (pre-sign-up account takeover; migration `20261104070000`; the first version refused password sign-ups and broke code sign-ups on the local stack, since the auth server gives those a random password), views/materialized views/definer functions covered by the rules and tests, sign-out made race-proof (supabase-js can't write the session back while signed out), logout results read correctly, the fake auth server answers like real Supabase, RLS tests now fail on the reviewer's weakened templates, migrations check their own effect, the import guard parses imports, production tests opt-in. One reviewer claim didn't hold (migrations being no-ops on production: owner and grantor there are `postgres`). In the final check the config property test found one more bad URL (`https:///&`), fixed. Harness: pgTAP 51/51. Pre-existing hex-guard gaps queued as a separate task.

**After round 2, on Sanket's local stack (2026-11-04)**: `supabase test db` 52/52 (4 files), local API 8/8, including the takeover test (an attacker's password fails before and after the owner confirms by code, so confirmation goes through the update the trigger watches). Left: Sanket reads the diff, then task 16.

**Stack**: Expo SDK 58 · TypeScript strict · jest-expo 58 + @testing-library/react-native 14 · Supabase CLI v3 (in v3, `migration list`, `db diff` and `db push` target the **local** database unless given `--remote`; `--linked` is gone) (`npx supabase@3`, or Homebrew; the exact version goes in `supabase/README.md`) · Docker. New app dependency: `@supabase/supabase-js` (2.118.0 is current on npm today; `npx expo install` picks the version). Already installed: `expo-sqlite`, `fast-check`.

**Facts checked (2026-11-03)**
- **Migration history**: the live project recorded `20261031143232 waitlist`, `20261031144424 waitlist_hardening`, `20261031173425 waitlist_swarm_fixes`, `20261031173802 waitlist_trim_order`. Production stored the SQL without comments, with the regex escapes (`­` …) written as the actual characters. After removing `--` comment lines, decoding `\uXXXX`, and removing spaces, tabs and newlines, the md5 of each local file equals the md5 of the recorded SQL, for all four. So the content matches and only the version numbers differ. Task 1 confirms this again with `supabase db diff --remote`.
- **Security advisor**: `ping()` is executable by `authenticated` (WARN); `join_waitlist()` by `anon` and `authenticated` (intended); `waitlist` has RLS on with no policies (INFO, intended).
- **SDK 58 "Using Supabase" guide** (Expo repo at `expo@58.0.0`; `docs.expo.dev` is blocked in the cloud session): `import 'expo-sqlite/localStorage/install'`; `createClient(url, key, { auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`; the `AppState` listener calling `startAutoRefresh` / `stopAutoRefresh`; env names `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no `react-native-url-polyfill`.
- **`supabase test db`** runs `pg_prove` on every `.sql` / `.pg` file under `supabase/tests/`, each in its own rolled-back transaction. The two SQL-editor scripts there today (`waitlist_normalize.sql`, `waitlist_storage.sql`, which ends in an error on purpose) would be picked up and fail, so they move to `supabase/scripts/` (task 2).
- **Local email**: the CLI captures auth emails in Mailpit at `localhost:54324`; templates are set in `config.toml` (`[auth.email.template.magic_link]`, `content_path`). The `{{ .Token }}` variable is the 6-digit code.
- **To verify during the build** (then pinned by tests): whether supabase-js runs under jest-expo with a mocked `fetch` (task 7 spike); which `onAuthStateChange` event a rejected refresh produces; whether `signOut()` clears local storage when the server call fails with a network error; the `isAuthRetryableFetchError` export; the `config.toml` key names for OTP length/expiry and the SMS provider (read the generated file, don't guess).

---

## Architecture

```
src/app/…, src/scan/, src/plants/, src/storage/     must not import src/backend/ (guard test)
src/backend/                                        nothing imports it yet; the accounts spec's screens will
  config.ts      readBackendConfig(env, isDev) → { configured: true, url, key } | { configured: false }
  errors.ts      toBackendError(unknown) → 'not_configured' | 'offline' | 'rate_limited' | 'session_expired' | 'unknown'
  supabase.ts    getSupabase(): lazy, memoized client + AppState listener; resetSupabaseForTests()
  session.ts     getSession · getCurrentUser · onSessionChange · setSessionFromAuth · signOut
supabase/
  config.toml    local stack settings (anonymous off, SMS off, email code)
  templates/     magic_link.html, confirmation.html (code only, no link)
  migrations/    4 renamed waitlist files + 1 new (ping grant)
  tests/         *.test.mjs (static + existing production tests) · database/*.test.sql (pgTAP) · local/*.test.mjs (local stack)
  scripts/       the two SQL-editor scripts, moved
```

- **Session states** (`session.ts`): `signed_out` → `setSessionFromAuth` → `signed_in`; refresh keeps `signed_in`; `signOut()` → `signed_out` (reason `user`); a refresh the server rejects → `signed_out` (reason `session_expired`). Tell the two `SIGNED_OUT`s apart with a module-level `signingOut` flag set only inside `signOut()`. A network error during refresh never leaves `signed_in`.
- **`signOut()`**: `await client.auth.signOut()`; if that returns an error, also `signOut({ scope: 'local' })` so the phone is signed out no matter what, then return `offline` / `unknown` from the first error. Never touches SQLite or photo files (it doesn't import them).
- **Lazy client**: `getSupabase()` reads the config, returns `null` when not configured, otherwise makes the client once and adds the `AppState` listener once. The `expo-sqlite/localStorage/install` import lives inside `supabase.ts`, so it runs only when that module is first loaded, and `session.ts` loads it with a lazy `require` inside `getSupabase` callers, not at the top of the file. (If the lazy `require` trips `reactCompiler` or the typed-routes build, fall back to a top-level import in `supabase.ts` and keep `session.ts` free of it; the "no request at import" test still holds because making the client sends nothing.)
- **Env**: `config.ts` reads `process.env.EXPO_PUBLIC_SUPABASE_URL` and `process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with dot access (so Expo can inline them), then passes them to the pure `readBackendConfig(env, isDev)`. Tests call the pure function.
- **Database tests**: pgTAP, with users inserted straight into `auth.users` inside the test transaction, and `set local role authenticated` + `set local request.jwt.claims` to act as each user. The randomized RLS check runs in SQL with `setseed()` so it's repeatable. *Deviation from the spec*: the spec says "property tests with fast-check" for RLS. The database tests have no JS dependencies, so the RLS property test is seeded random SQL instead (same approach as the existing waitlist property script). fast-check is still used for the app-side properties (config, error mapping).
- **Local-stack API tests** (`supabase/tests/local/`): Node's built-in test runner and `fetch`, no dependencies, same style as the existing waitlist tests. A shared guard refuses to run unless `SUPABASE_URL` is `http://127.0.0.1…` or `http://localhost…`.

---

## Files

### New

| File | What |
|---|---|
| `supabase/config.toml` | From `supabase init`, then: anonymous sign-ins off, SMS sign-up off, email sign-up on, OTP length 6, OTP expiry 600, the two templates |
| `supabase/templates/magic_link.html`, `confirmation.html` | Code-only emails: "Your Rebloom code: {{ .Token }}" |
| `supabase/migrations/<ts>_ping_grant.sql` | `revoke execute on function public.ping() from authenticated;` |
| `supabase/README.md` | Commands, the production rule, the table/function rules and the template |
| `supabase/tests/migrations.test.mjs` | Static: migration file names (no network) |
| `supabase/tests/config.test.mjs` | Static: `config.toml` auth settings and templates (no network) |
| `supabase/tests/database/grants.test.sql` | pgTAP: function and table grants, RLS on every public table |
| `supabase/tests/database/rls_template.test.sql` | pgTAP: the template table's owner rules and cascade |
| `supabase/tests/database/rls_property.test.sql` | pgTAP: seeded random users and rows, isolation holds |
| `supabase/tests/local/guard.mjs` | Refuses non-local `SUPABASE_URL` |
| `supabase/tests/local/auth.test.mjs` | Anonymous refused; email code via Mailpit; signed-in user vs waitlist and `ping()` |
| `app/.env.example` | The two `EXPO_PUBLIC_` names with comments (local stack and LAN address) |
| `app/src/backend/config.ts`, `errors.ts`, `supabase.ts`, `session.ts` | As above |
| `app/src/backend/__tests__/config.test.ts`, `errors.test.ts`, `supabase.test.ts`, `session.test.ts` | Unit + property tests |
| `app/src/testing/fakeLocalStorage.ts` | In-memory `localStorage` for jest (the `expo-sqlite/localStorage/install` mock) |
| `app/src/testing/fakeAuthServer.ts` | A `fetch` mock that answers the few Auth endpoints the session tests need (token refresh, logout), with failure switches |
| `.handoff/device-checklist.md` | Device checks for this spec (the folder doesn't exist yet) |

### Changed

| File | Change |
|---|---|
| `supabase/migrations/20261031134500_waitlist.sql` … `20261031171500_waitlist_trim_order.sql` | `git mv` to `20261031143232_…`, `20261031144424_…`, `20261031173425_…`, `20261031173802_…` (content unchanged) |
| `supabase/tests/waitlist_normalize.sql`, `waitlist_storage.sql` | `git mv` to `supabase/scripts/` |
| `app/package.json` (+ lock) | `@supabase/supabase-js` |
| `app/jest.setup.ts` | Mock `expo-sqlite/localStorage/install` with the fake |
| `app/src/__tests__/guards.test.ts` | Import guard for `src/backend/` |
| `app/src/__tests__/root-layout.test.tsx` | App start makes no `fetch` call |
| `app/README.md`, `CLAUDE.md` | "Backend" section |

---

## Tasks

Each task is one commit. **Strict TDD**: write the test, watch it fail, then implement. Branch: `feature/supabase-foundation` off `develop` (repo convention; confirm with Sanket if this session is limited to `develop`). Production is touched only in task 16, and read-only before that.

### Phase 0: Migration history and local stack

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 1 | Rename the 4 migrations to the recorded versions. Then `supabase link --project-ref vhxcgmupopeochwvmwcv`, `supabase migration list --remote` (4 on both sides, none pending), `supabase db diff --remote` (no changes). Paste both outputs in the PR. If the diff isn't empty: stop and report | `supabase/migrations/*` | T1 |
| 2 | Move the two SQL-editor scripts to `supabase/scripts/`, keeping their header comments | `supabase/scripts/*` | T1 also checks no `.sql` file sits directly in `supabase/tests/` |
| 3 | `supabase init`; set the auth settings and the two templates; `supabase start` and `supabase db reset` run clean | `supabase/config.toml`, `supabase/templates/*` | T2 |

### Phase 1: Database rules (depends on 3)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 4 | Grants test, then the `ping()` migration | `supabase/tests/database/grants.test.sql`, `supabase/migrations/<ts>_ping_grant.sql` | T3 |
| 5 | The RLS template test (the template SQL is copied into the README in task 15) | `supabase/tests/database/rls_template.test.sql` | T4 |
| 6 | The RLS property test | `supabase/tests/database/rls_property.test.sql` | T5 |

### Phase 2: App client (depends on nothing in Phases 0–1; can run in parallel)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 7 | `npx expo install @supabase/supabase-js`; the fake `localStorage` and its jest mock; `.env.example`. **Spike**: a real client over the fake storage with a mocked `fetch` loads in jest-expo and `getSession()` returns null. If it doesn't load, switch the session tests to a typed fake of the client's `auth` (Risks) | `package.json`, `jest.setup.ts`, `src/testing/fakeLocalStorage.ts`, `app/.env.example` | T6 |
| 8 | `readBackendConfig` | `src/backend/config.ts`, `__tests__/config.test.ts` | T7 |
| 9 | `toBackendError` | `src/backend/errors.ts`, `__tests__/errors.test.ts` | T8 |
| 10 | `getSupabase` (lazy, memoized, AppState listener) | `src/backend/supabase.ts`, `__tests__/supabase.test.ts` | T9 |
| 11 | `session.ts`: `getSession`, `getCurrentUser`, `onSessionChange`, `setSessionFromAuth`; the fake auth server | `src/backend/session.ts`, `src/testing/fakeAuthServer.ts`, `__tests__/session.test.ts` | T10 |
| 12 | `session.ts`: `signOut`, `session_expired`, network errors during refresh | `src/backend/session.ts`, `__tests__/session.test.ts` | T11 |
| 13 | Guards: no import of `src/backend/` from screens and features; app start makes no request | `src/__tests__/guards.test.ts`, `src/__tests__/root-layout.test.tsx` | T12 |

### Phase 3: Local-stack API tests (depends on 3 and 4)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 14 | Local guard + auth tests | `supabase/tests/local/guard.mjs`, `auth.test.mjs` | T13 |

### Phase 4: Docs (depends on 1–14)

| # | Task | Files | Test |
|---|---|---|---|
| 15 | `supabase/README.md` (commands, CLI version, "production only changes through `supabase db push` of reviewed migrations", the table/function rules, the template); "Backend" sections in `app/README.md` and `CLAUDE.md` (start the stack, LAN address for a phone, how to run each test suite); `.handoff/device-checklist.md` | docs | None (docs). Full green run: `npm run typecheck`, `npm run lint`, `npm test` in `app/`; `node --test "supabase/tests/*.test.mjs"`; `supabase test db`; `node --test "supabase/tests/local/*.test.mjs"` |

### Phase 5: Production (after the review, with Sanket)

| # | Task | Files | Check |
|---|---|---|---|
| 16 | After the break-test, the swarm offer and Sanket's read of the diff, and after merge: `supabase migration list --remote` → `supabase db push --remote --dry-run` (only `20261104050000_ping_grant`, `20261104060000_default_privileges` and `20261104070000_clear_password_on_confirm` listed; each ends with a self-check that fails it if it had no effect) → `supabase db push --remote` → `supabase migration list --remote` (7 and 7). Then check "Confirm email" is on in the dashboard (the trigger depends on it). The security advisor no longer lists `ping()` for `authenticated`. Run the keep-alive workflow by hand (it passes). `REBLOOM_PROD_TESTS=1 node --test "supabase/tests/production/*.test.mjs"` passes against production. Sanket checks anonymous sign-ins are off in the dashboard | none | Outputs pasted in the PR |

---

## Testing Plan

| ID | Test | File | Spec trace |
|---|---|---|---|
| T1 | Migration files: the first four are exactly `20261031143232_waitlist.sql`, `20261031144424_waitlist_hardening.sql`, `20261031173425_waitlist_swarm_fixes.sql`, `20261031173802_waitlist_trim_order.sql`; every file starts with a unique 14-digit version, in order; no `.sql` file directly in `supabase/tests/` | `migrations.test.mjs` | Req 1; edge 1 |
| T2 | `config.toml`: anonymous sign-ins false; SMS sign-up false; email sign-up true; OTP length 6; OTP expiry 600; both templates point at files that contain `{{ .Token }}` and no `ConfirmationURL` | `config.test.mjs` | Req 2 |
| T3 | `waitlist_normalize_email` removes each character in its list (U+00AD, U+061C, U+180E, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+206F, U+FEFF) and the trailing NBSP/dots, so the escaped migration behaves like production's decoded copy; `anon` can execute `ping()`, `authenticated` can't; `join_waitlist(text,text)` executable by both; `waitlist_normalize_email` and `waitlist_email_ok` by neither; `anon` and `authenticated` have no `select/insert/update/delete` on `public.waitlist`; every table in `public` has RLS on; no function in `public` is executable by `anon` except `ping` and `join_waitlist` (catches future slips) | `grants.test.sql` | Req 3, 4; edge 8 |
| T4 | Template table, users A and B: A inserts, selects, updates and soft-deletes their own row; A sees 0 of B's rows; A inserting with `user_id = B` fails; A updating B's row changes 0 rows; A changing own `user_id` to B fails; A can't `delete` (no policy); `anon` can't select; deleting A from `auth.users` removes A's rows and keeps B's | `rls_template.test.sql` | Req 3; Data model; edge 9 |
| T5 | `setseed(0.42)`; 20 rounds of 2–5 users with 0–8 rows each, random owners: as each user, `count(*)` equals that user's own rows; a random insert with another user's id fails; a random update or soft delete of another user's row changes 0 rows | `rls_property.test.sql` | Req 3; edge 9 (property, high risk) |
| T6 | Spike: a real client over the fake storage loads in jest-expo; `auth.getSession()` → null; no `fetch` call | `supabase.test.ts` | Req 5 (feasibility) |
| T7 | Both vars + `https://` → configured; either missing or empty → not; `http://` → configured only when `isDev`; whitespace around values trimmed; **property** (fast-check): for random strings, configured ⇒ the URL starts with `https://` (or `http://` with `isDev`) and the key is non-empty; never throws | `config.test.ts` | Req 5; edge 2 |
| T8 | Retryable fetch error → `offline`; status 429 → `rate_limited`; anything else → `unknown`; **property**: for random values (errors, strings, objects with random `status`/`name`/`message`, null), the result is always one of the 5 codes and never contains the input's message | `errors.test.ts` | Req 5 (closed error set) |
| T9 | Importing `supabase.ts` doesn't call `createClient`; first `getSupabase()` makes it once, second returns the same one; not configured → `null`, no client; `AppState` `active` → `startAutoRefresh`, `background` / `inactive` → `stopAutoRefresh`; the listener is added once | `supabase.test.ts` | Req 5; edge 5 |
| T10 | `getSession()` with nothing stored → null, no `fetch`; `setSessionFromAuth` → stored, listeners get `signed_in` once, `getCurrentUser()` → id, email, provider; a fresh client (reset) over the same fake storage → the same user, no `fetch`; unsubscribe stops calls; backend not configured → every function returns `not_configured` | `session.test.ts` | Req 5; edge 7 |
| T11 | `signOut()` → storage cleared, listeners get `signed_out` (reason `user`); `signOut()` with the logout call failing on the network → storage cleared anyway, result `offline`; the fake server rejects a refresh (400 `refresh_token_not_found`) → `signed_out` with `session_expired`, listener called once; a refresh failing on the network → `offline` within 10 s (fake timers), still `signed_in`, no `session_expired`; a 429 on the refresh of an expired token → `signed_out` with `session_expired` (supabase-js removes the session; found in task 12); a session restored at start-up isn't announced as `signed_in`; `signOut()` leaves the SQLite fake and the file-system fake untouched | `session.test.ts` | Req 5; edges 3, 4, 5 |
| T12 | No file under `src/app/`, `src/scan/`, `src/plants/`, `src/storage/` imports from `backend/`; rendering the root layout makes no `fetch` call | `guards.test.ts`, `root-layout.test.tsx` | Req 5 (zero requests on start) |
| T13 | Guard: with `SUPABASE_URL` set to a non-local address, the suite exits with a message before any request. Then: anonymous sign-in → refused; send a code to `t-<run>@rebloom.test`, read it from Mailpit, verify → access token; with it: `select` on `waitlist` refused, `rpc/ping` refused, `rpc/join_waitlist` with an `example.com` address → 204; with the publishable key only: `rpc/ping` → `true` | `local/auth.test.mjs` | Req 2, 4; edges 8, 10 |

Edge cases from the spec: 1 → task 1 + T1 · 2 → T7 · 3 → T11 · 4 → T11 · 5 → T9, T11 + device · 6 → device · 7 → T10 · 8 → T3, T13 · 9 → T4, T5 · 10 → T13 · 11 → T7 + device.

### Device checklist (`.handoff/device-checklist.md`, task 15)
- [ ] Android phone (Expo Go 58) on the same Wi-Fi as the computer, `.env.local` with the LAN address: a dev-only call to `getSupabase()` reaches the local stack. Remove the call before committing.
- [ ] Session kept after a force-quit (a local user signed in through a dev-only call).
- [ ] Back from 1+ hour in the background: the next request uses a refreshed token.
- [ ] Phone clock set 2 hours wrong: no sign-out and no refresh loop.
- [ ] The localStorage database file `expo-sqlite` creates is separate from `rebloom.db` (dev log of the documents folder).

---

## Risks

| Risk | Mitigation |
|---|---|
| supabase-js doesn't load or behave under jest-expo (globals, timers) | Task 7 spike first. Fallback: session tests use a typed fake of `client.auth` (typed against the real package, so `tsc` catches drift), and the real library is covered by the local-stack tests and the device checks |
| A rejected refresh and a user sign-out produce the same event | The `signingOut` flag; T11 covers both orders |
| `signOut()` keeps the local session when the server call fails | The `scope: 'local'` fallback; T11 |
| `supabase db diff --remote` reports grant or comment noise even though the SQL matches | Read the diff: only real schema changes stop the task. Record anything ignored in the PR |
| A pushed migration hits production with a mistake | Production changes only in task 16, after review; `--dry-run` first; the only new migration is one `revoke` |
| Tests create users in production | The local guard (T13); the static tests make no requests; the existing production tests use reserved domains and no auth |
| The lazy `require` doesn't work with the React Compiler / typed routes | Fallback in Architecture; T9 still holds |
| `config.toml` key names differ by CLI version | Read the generated file in task 3; T2 checks the values, not the comments |

---

## Gate 2

**Architecture**
- [x] Follows existing patterns (non-route code outside `src/app/`, tests in `__tests__`, fakes in `src/testing/`, `@/` alias)
- [x] Layers: `session.ts` → `supabase.ts` → `config.ts` / `errors.ts`; nothing in the app imports the backend yet (guarded)
- [x] Production is read-only until task 16

**Task breakdown**
- [x] All files to change are listed
- [x] All new files are listed with their locations
- [x] Each task is small (≤4 files)
- [x] Dependencies between tasks are marked (Phase 2 runs in parallel with Phases 0–1)

**Testing**
- [x] Data layer: T3–T5 (pgTAP, including the property test)
- [x] Business logic: T7–T11 (including fast-check properties)
- [x] Integration: T13 against the local stack; T12 for app start
- [x] UI: none (no UI in this spec)
- [x] Every spec edge case is traced (above); device-only checks are in the checklist
- [x] One deviation from the spec is stated: the RLS property test is seeded random SQL, not fast-check

**Result: PASSED**
