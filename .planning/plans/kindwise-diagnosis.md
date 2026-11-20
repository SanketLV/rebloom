# Plan: Kindwise diagnosis (species + disease)

**Spec**: .planning/specs/kindwise-diagnosis.md
**Design**: .planning/design/screens/kindwise-diagnosis.md (approved, Design Gate round 2)
**Handoff**: .handoff/kindwise-diagnosis.md (Kindwise API facts verified 2026-11-20, codebase map)
**Epic**: none (followed by `treatment-plan`)
**Created**: 2026-11-20
**Status**: draft
**Risk**: high (paid credits, user photos to a third party, health advice, a secret key on the server, local DB migration, session module)

**Stack**: Supabase (Postgres 17, Edge Functions on Deno 2, CLI v3) · Expo SDK 58 · Expo Router 58 · TypeScript strict · jest-expo 58 + RNTL 14 · sql.js · fast-check. No new dependencies, no new native modules (no dev build needed).

**Kindwise facts used** (handoff, verified): `POST https://plant.id/api/v3/identification?details=common_names,description,treatment,url,is_harmful&language=en&async=true` with header `Api-Key`, body `{ images: ["data:image/jpeg;base64,…"], health: "all", similar_images: false }` (2 credits; never send `latitude`/`longitude`). `201` → `access_token`. `GET /api/v3/identification/:token` (free) until `completed` is set. `DELETE /api/v3/identification/:token` (free). `429` = Kindwise out of credits. `treatment.*` may be a string or an array of strings. `question.options.yes|no` each name **one** suggestion (`suggestion_index`, `entity_id`), not a list. Disease suggestions with `is_harmful = false` are not problems.

---

## Decisions this plan makes (confirm or change before build)

Each one changes or fills in something the spec left open. Recommended choice first.

| # | Decision | Why |
|---|---|---|
| D1 | **The app confirms, then the server deletes.** After the app has saved the result in SQLite it calls `DELETE diagnose?scan_id=…`; only then does the server delete the Kindwise identification and the `diagnosis_requests` row. | The spec deletes "once fetched". If the server deletes right after answering and the reply is lost, the retry finds nothing and charges a second scan. With a confirm step every retry is free and idempotent. |
| D2 | **Kindwise still working after 15 s → `202 { status: "pending" }`, nothing released.** The scan stays counted; the app keeps the scan `pending` and fetches it with `GET` later. Released only when Kindwise refused the create (no token) or the photo isn't a plant. | With `async=true` Kindwise has accepted, and charged, the identification. Releasing on a timeout would give a free retry that costs 2 more credits. |
| D3 | **Daily credits count what was spent and are never released after Kindwise accepted the create** (not-a-plant included). Only the user's monthly scan is released for not-a-plant. | The cap bounds real spend. The spec said "release both"; that would let not-a-plant photos drain credits without hitting the cap. |
| D4 | **Pending scans are finished when My Plants comes into view, not at app launch.** | The root-layout test guarantees an app start sends nothing (accounts spec). My Plants is where the "Finishing diagnosis…" row is shown anyway. |
| D5 | **A scan row and its photo are written before the call** (`status = 'pending'`), become `ready` when the result arrives, `done` on Save or Feedback. Leaving a `ready` scan from the live flow without saving deletes the row and photo (as today). | The killed-app case needs the row and photo to exist before the call. Status `ready` (not in the spec) separates "result here, not saved yet" from saved, so a crash never loses a paid result and closing the flow still leaves nothing behind. |
| D6 | **A finished pending scan shows "Diagnosis ready · See result" in My Plants; tapping opens the scan flow at Questions with the stored diagnosis.** Not designed yet: one row state added to the design doc's row 9 before build. | Without it a scan finished in the background has nowhere to go. Reusing Questions → Result keeps one flow. |
| D7 | **Expired request rows are swept inside `POST`** (up to 5 rows older than 7 days per call: Kindwise `DELETE`, then the row). No scheduler. | The cleanup needs the Kindwise key, which only the function has. Kindwise keeps identifications 6 months anyway; the sweep only bounds our own table. |
| D8 | **Anonymous sign-ins on production are a dashboard change, ticked in the PR**, not "the reviewed config". | `supabase/README.md`: auth settings in production are changed in the dashboard, never with `config push` (it would copy local `site_url` over production's). |

---

## Architecture

```
App                                              Server
routes (src/app/scan/*, (tabs)/plants)
  └── scan services (runDiagnosis, saveScan, resumePending)
        ├── diagnosis/ (types, kindwise mapping, rerank: pure)
        ├── storage/ (migration 2, scansRepo, plantsRepo)
        └── diagnosis/kindwiseDiagnoser ──► backend/diagnose.ts ──► supabase.functions.invoke('diagnose')
                                            backend/session.ts (ensureScanSession: session | stash | anonymous)
                                                                     │
                                                 functions/diagnose/index.ts   (HTTP, auth, order of steps)
                                                   ├── _shared/caller.ts       (token → user; shared with delete-account)
                                                   ├── diagnose/kindwise.ts    (pure: validate body, map response; node-testable)
                                                   ├── Postgres: begin/attach/finish/end_diagnosis (security definer)
                                                   └── plant.id v3 (KINDWISE_BASE_URL, default https://plant.id)
```

### Server: `POST /functions/v1/diagnose`

1. Not POST/GET/DELETE → `405`. `caller(request)` → `401` / `503` exactly as `delete-account` (anonymous users have role `authenticated` and are accepted).
2. `validateBody` (pure): JSON, `scan_id` a UUID, 1–3 images, each base64 decoding to ≤ 2 MB and starting `FF D8 FF` → else `400` / `413`. Nothing logged about the body.
3. `begin_diagnosis(user, scan_id)`, one SQL call, one transaction:
   - row exists with a token → `has_token` (no charge): go to step 6 with that token.
   - row exists, no token, younger than 60 s → `running` → `409 in_progress` (app waits 2 s and retries, max 5).
   - row exists, no token, older than 60 s (a crashed call) → release its scan, keep its credits, start over below.
   - else: monthly count ≥ `free_scans` → `quota` (`429 quota_exceeded`, `resets_at`); today's credits + 2 > `daily_cap` → `daily_cap` (`503`); otherwise insert the row (token null), count +1, credits +2 → `started` with `scans_left`.
4. Sweep (D7), best effort, never fails the request.
5. Kindwise create (`async=true`). Network error / 4xx / 5xx / Kindwise `429` → `fail_diagnosis(user, scan, release_credits => true)` → `502 upstream_failed`. Else `attach_token(user, scan, token)`.
6. Poll `GET` every 1.5 s until `completed` or 15 s → else `202 { status: "pending" }` (D2).
7. `mapResult` (pure). `is_plant.binary = false` → Kindwise `DELETE`, `fail_diagnosis(…, release_credits => false)` → `422 not_a_plant`. Else `200` (spec body) with `scans_left`, `resets_at`.

`GET ?scan_id` → row with token → steps 6–7 (`404` when no row for **this** user). `DELETE ?scan_id` → Kindwise `DELETE` (404 there is fine) → `end_diagnosis` → `204` (also when already gone).

Constants live in the migration's functions: `free_scans = 3`, `daily_cap` (credits per UTC day, set with Sanket before production; trial account has 100 credits → start at 40). Changing them is a reviewed migration.

### Server: database (new migration)

As in the spec's Data Model, with these differences (all server-only; documented in `supabase/README.md`, "Server-only tables"):
- `diagnosis_requests.access_token` is **nullable** (the row is the lock before Kindwise answers).
- Grants: `revoke all … from anon, authenticated` on all three; `grant select on scan_usage to authenticated`; the "own usage" policy is `to authenticated using ((select auth.uid()) = user_id)` so the existing generic policy test in `grants.test.sql` accepts it.
- Functions `begin_diagnosis(uuid, uuid)`, `attach_token(uuid, uuid, text)`, `fail_diagnosis(uuid, uuid, boolean)`, `end_diagnosis(uuid, uuid)`, `expired_diagnoses(int)`: `security definer`, `set search_path = ''`, fully qualified, row locks (`for update` / `on conflict`) so two calls with one `scan_id` can't both start. Revoked from `public, anon, authenticated`, granted to `service_role` only. They take `user_id` as an argument because the function calls them with the secret key (no `auth.uid()`); since no API role can execute them, nobody can pass someone else's id.
- Month is `date_trunc('month', now() at time zone 'utc')::date`, day `(now() at time zone 'utc')::date`.

### App: session (highest risk)

- `SessionUser` gains `isAnonymous: boolean` (from `session.user.is_anonymous`). `account/store.ts`: an anonymous `signed_in` / `refreshed` → `{ status: 'guest' }`. Settings and the account screens therefore never show an anonymous account as signed in.
- `ensureScanSession()` in `session.ts` (the only new entry point): stored session → done; else a stashed anonymous session → `setSessionFromAuth(supabase.auth.setSession(stash))`, drop the stash on success; else `setSessionFromAuth(supabase.auth.signInAnonymously())`. Offline → `offline` (spec edge 9 = edge 4). Runs only when a scan is sent, never at app start.
- **Stash on email sign-in:** in `setSessionFromAuth`, before awaiting, if the stored session is anonymous, copy it to `rebloom-anon-session`. The key must **not** start with `rebloom-auth-`: `removeSessionKeys` deletes every key with that prefix. Restored lazily by `ensureScanSession` after a sign-out (not inside `signOut`, which must stay offline-safe and keeps `blockedUntilSignIn`). Restoring goes through `setSessionFromAuth`, so the late-sign-in guards (`signInSequence`, blocking) apply unchanged.
- Deleting an email account doesn't touch the stash; deleting is not offered to a guest (anonymous) account.

### App: diagnosis types and mapping

- `Candidate = { conditionId: ConditionId | null; confidence: number; disease?: { id, name, commonNames, description } }`. Invariant: `conditionId` or `disease` is set. One helper `candidateName(c)` / `candidateSubtitle(c)` replaces every `CONDITIONS[c.conditionId]` lookup (result.tsx, PlantRow, FeedbackSheet's "something else" list, `headerLabel`).
- `Diagnosis` gains `species: Species[]`, `healthy: { probability } | null`, `question: KindwiseQuestion | null`, `treatment: Record<diseaseId, Treatment>`; the fake fills them with empty values.
- `diagnosis/kindwiseMap.ts` (app side, pure): server body → `Diagnosis`. Known care problems map to our 7 by Kindwise disease **name** (lower-cased, `\p{Cf}` stripped, review.md rule); several Kindwise diseases mapping to one condition keep the **highest** probability, never the sum (summing could lift a low-confidence result over 0.50: review.md rule). `is_harmful = false` diseases are dropped. Healthy (`is_healthy.binary`) → top candidate `healthy` with `is_healthy.probability`.
- Low confidence stays `isLowConfidence` (top < 0.50) plus species < 0.30 → "Species not sure" (thresholds next to `LOW_CONFIDENCE` in `confidence.ts`).
- Kindwise question re-rank: answer `yes` boosts the `yes` suggestion and lowers the `no` one (same `BOOST` / `LOWER` and total-preserving rule as `applyAnswers`); `no` the reverse; `not_sure` nothing. `persistScan` already flags low confidence when either the model or the final result is low, so answers can't clear the flag.

### App: flow

- `runDiagnosis` gets `diagnose(photo, { scanId })`, timeout `DIAGNOSIS_TIMEOUT_MS = 20_000`, and error kinds `not_plant | quota | busy | offline | server | pending` beside the existing ones. `kindwiseDiagnoser` turns server statuses into those kinds (`422` not_plant, `429` quota with `resetsAt`, `503` busy, `502` server, `202` / app timeout pending, fetch error offline, `409` retried inside, `401` once retried after `ensureScanSession`).
- Before the call: `persistPhoto` + scan row `pending` (D5), so a kill leaves a finishable row. On `200`: row `ready` with `model_result`, `species`, `treatment`, `kindwise_question`; app sends `DELETE` (D1, fire and forget; the sweep catches a lost one).
- Analyzing: new copy, "Still checking…" line after 8 s (announced once). Errors replace Analyzing with the matching screen (design 5–7).
- Questions: when `diagnosis.question` is set, step 0 is the Kindwise question ("1 of 4").
- Result: species line, unmapped names, healthy state, photo chip "Saved on your phone only", optional scans-left line.
- My Plants: `listUnfinishedScans` (status `pending` or `ready`, no plant) rendered above plants; on focus, `resumePending` calls `GET` for each `pending` row (one at a time, single flight) → `ready`, or needs-retry on `404`.

---

## Components

| Component | Type | Purpose |
|---|---|---|
| `scan_usage`, `kindwise_daily_usage`, `diagnosis_requests` | Tables | Monthly count per user, daily credits, request lock + token |
| `begin_diagnosis`, `attach_token`, `fail_diagnosis`, `end_diagnosis`, `expired_diagnoses` | SQL functions | All counting and locking, atomic, service_role only |
| `_shared/caller.ts` | Edge helper | Token → user / 401 / 503 (moved out of delete-account) |
| `diagnose/kindwise.ts` | Edge module (pure) | `validateBody`, `mapResult`, Kindwise URL building |
| `diagnose/index.ts` | Edge Function | POST / GET / DELETE as above |
| `fakeKindwise.mjs` | Test server | plant.id v3 stand-in for local API tests, behaviour picked by the image bytes |
| `ensureScanSession`, stash | Session | Session for scanning, anonymous by default |
| `backend/diagnose.ts` | Backend | `postDiagnose`, `getDiagnose`, `confirmDiagnose` over `functions.invoke` |
| `kindwiseMap.ts` | Domain (pure) | Server body → `Diagnosis`; condition mapping |
| `kindwiseDiagnoser` | Domain | Diagnoser over `backend/diagnose.ts` |
| `resumePending` | Scan service | Finish pending scans from My Plants |
| `NotPlantScreen`, `QuotaScreen` | Components | Design 5 and 7 |

## File Locations (new)

| File | Location | Purpose |
|---|---|---|
| `<ts>_kindwise_diagnosis.sql` | `supabase/migrations/` | Tables, grants, policy, functions |
| `diagnosis.test.sql` | `supabase/tests/database/` | pgTAP for the above |
| `caller.ts` | `supabase/functions/_shared/` | Shared caller check |
| `index.ts`, `kindwise.ts` | `supabase/functions/diagnose/` | The function and its pure part |
| `.env.example` | `supabase/functions/` | `KINDWISE_API_KEY`, `KINDWISE_BASE_URL` for local serve (real `.env` is gitignored) |
| `diagnose-mapping.test.mjs` | `supabase/tests/` | Static: `kindwise.ts` via Node 24 type stripping (no network) |
| `diagnose.test.mjs`, `fakeKindwise.mjs` | `supabase/tests/local/` | Local API tests + fake plant.id |
| `diagnose.ts` | `app/src/backend/` | Function calls |
| `kindwiseMap.ts`, `kindwiseDiagnoser.ts` | `app/src/diagnosis/` | Mapping, diagnoser |
| `resumePending.ts` | `app/src/scan/` | Pending scans |
| `NotPlantScreen.tsx`, `QuotaScreen.tsx` | `app/src/scan/components/` | New screens' bodies |
| `fakeDiagnoseServer.ts` | `app/src/testing/` | `functions/v1/diagnose` stand-in on the existing fake fetch |
| tests | `app/src/**/__tests__/` | As listed per task |

## Files to Change

| File | What changes | Why |
|---|---|---|
| `supabase/config.toml` | `enable_anonymous_sign_ins = true`; `[functions.diagnose] verify_jwt = false` | Anonymous scanning; own token check |
| `supabase/tests/config.test.mjs` | Expect anonymous on (rate limit 30/h), diagnose entry | Static config pins |
| `supabase/tests/database/grants.test.sql` | Table privileges of the 3 tables; plan count | Explicit pins |
| `supabase/functions/delete-account/index.ts` | Use `_shared/caller.ts` | One copy of the token check |
| `supabase/README.md` | Server-only tables section, `diagnose` answers, secrets, D8 dashboard step | Rules doc |
| `app/src/backend/session.ts` | `isAnonymous`, stash, `ensureScanSession` | Anonymous scanning |
| `app/src/account/store.ts` | Anonymous → guest | Spec |
| `app/src/diagnosis/{types,engine,confidence,rerank,fakeDiagnoser}.ts` | Widened types, swap, species threshold, question re-rank | Spec |
| `app/src/storage/{migrations,scansRepo,plantsRepo}.ts` | Migration 2, status, new columns, tolerant `parseCandidates`, unfinished list | Spec, D5 |
| `app/src/scan/{runDiagnosis.ts,session.tsx,saveScan.ts}` | `scanId`, error kinds, 20 s, pending row, question answer | Spec |
| `app/src/app/scan/{analyzing,questions,result}.tsx` | Copy, slow line, error screens, Kindwise step, species/healthy/unmapped | Design 1–4, 6 |
| `app/src/app/(tabs)/plants.tsx`, `plants/components/PlantRow.tsx` | Unfinished rows, `candidateName` | Design 9, D4, D6 |
| `app/src/scan/components/{SaveSheet,FeedbackSheet}.tsx` | Pre-filled name, widened guess list | Design 8 |
| `app/src/__tests__/guards.test.ts` | Allow the scan files that now reach `src/backend` (by name) | Import guard |
| `app/src/testing/nativeMocks.ts` | Nothing new expected; touched only if a test needs it | — |
| `landing/src/pages/PrivacyPage.tsx` (+ its test) | Kindwise named as processor of the photo | Spec |
| `app/README.md` | Kindwise, anonymous accounts, local function setup | Spec |
| `.planning/design/screens/kindwise-diagnosis.md` | Row 9 gains the "Diagnosis ready" state (D6) | Design gap |

---

## Tasks

TDD on every task: failing test first. Each task ≤ 3 files besides its tests, one commit. Branch `feature/kindwise-diagnosis` from `develop`.

### Phase 1: Database (server)

| # | Task | Files |
|---|---|---|
| 1 | pgTAP first: tables exist with RLS; grants (authenticated: select on `scan_usage` only; anon nothing); user A sees only own `scan_usage`; the 5 functions not callable by `anon`/`authenticated`, callable by `service_role`; `begin_diagnosis` sequence: started ×3 → quota on the 4th scan_id, same scan_id twice → running, stale (61 s, backdated) → restarted with the old scan released, cap reached → daily_cap with nothing counted; `fail_diagnosis(true/false)` releases what it says; month rollover (backdated row) counts from 0; deleting the user cascades both user tables. Then the migration. | `supabase/tests/database/diagnosis.test.sql`, `supabase/migrations/<ts>_kindwise_diagnosis.sql`, `grants.test.sql` |
| 2 | Config: anonymous sign-ins on, `[functions.diagnose] verify_jwt = false`; static test updated first. | `supabase/config.toml`, `supabase/tests/config.test.mjs` |

### Phase 2: Edge Function (depends on 1)

| # | Task | Files |
|---|---|---|
| 3 | Move the caller check to `_shared/caller.ts`; `delete-account` uses it. Existing `delete-account` local tests are the regression net (run before and after). | `supabase/functions/_shared/caller.ts`, `supabase/functions/delete-account/index.ts` |
| 4 | Pure `kindwise.ts`: `validateBody` (UUID, 1–3 images, ≤ 2 MB decoded, JPEG magic, base64 with or without data-URL prefix) and `mapResult` (top 3 species/diseases, `is_harmful=false` dropped, treatment string-or-array → arrays, `question` → `{ text, yes: {index, id, name}, no: {...} }` or null, missing/NaN probabilities → 0, unknown fields ignored, text kept as plain strings). Static tests with fixtures from the Postman examples. | `supabase/functions/diagnose/kindwise.ts`, `supabase/tests/diagnose-mapping.test.mjs` |
| 5 | Fake plant.id server for local tests: create (201 + token), GET (completes after N polls), DELETE, 429 credits, 500, slow (never completes), not-a-plant, question present; behaviour from a marker in the image bytes; records every call so tests count them. | `supabase/tests/local/fakeKindwise.mjs`, `supabase/functions/.env.example` |
| 6 | `diagnose/index.ts` POST path (steps 1–7) against the fake. Local tests: happy path (count 0 → 1, `scans_left` 2, no lat/long in the Kindwise body, `Api-Key` sent, key never in the reply); 401 no/bad token; anonymous user accepted; 400 (4 images, PNG, no scan_id); 413 (3 MB); not-a-plant → 422, count unchanged, credits kept; Kindwise 500 / 429 → 502, both released; slow → 202, count kept; 4th scan → 429 with `resets_at`; cap → 503; **two concurrent POSTs, one scan_id → one Kindwise create, count +1**; retry after success → same body, no second create. | `supabase/functions/diagnose/index.ts`, `supabase/tests/local/diagnose.test.mjs` |
| 7 | GET and DELETE: GET own finished → 200 free (no create call), still running → 202, another user's scan_id → 404, unknown → 404; DELETE → Kindwise DELETE + row gone, repeat → 204; sweep of rows > 7 days (backdated) inside a POST. | same two files |
| 8 | README: server-only tables and why they skip the template, `diagnose` answers table, `KINDWISE_API_KEY` secret (`supabase secrets set`), local serve with `.env`, production steps (D8 dashboard tick, `functions deploy diagnose`, secret). | `supabase/README.md` |

### Phase 3: App data (parallel with Phase 2)

| # | Task | Files |
|---|---|---|
| 9 | Types widened (`Candidate`, `Species`, `Treatment`, `KindwiseQuestion`, `Diagnosis` fields, `Diagnoser.diagnose(photo, { scanId })`), `candidateName`/`candidateSubtitle`, fake fills empty fields. Existing diagnosis tests stay green. | `diagnosis/types.ts`, `diagnosis/conditions.ts`, `diagnosis/fakeDiagnoser.ts` |
| 10 | `kindwiseMap.ts`: server body → `Diagnosis`; name mapping to our 7 (**first step: read Kindwise's disease class list in its docs and pin the exact names in a test**; unknown names stay unmapped); max-not-sum merge; healthy; species threshold in `confidence.ts`. | `diagnosis/kindwiseMap.ts`, `diagnosis/confidence.ts` |
| 11 | Kindwise question re-rank in `rerank.ts` (`applyQuestionAnswer`), total kept, `not_sure` no-op. | `diagnosis/rerank.ts` |
| 12 | Local migration 2 (5 columns; `status` default `'done'`; index on `status` where `plant_id IS NULL`); migration test on a DB with v1 fake rows: they read back unchanged with `status = done`. | `storage/migrations.ts`, `storage/__tests__/migrations.test.ts` |
| 13 | `scansRepo`: `insertPendingScan`, `markReady`, status `done` on save/feedback, `deleteUnsavedScan`, `parseCandidates` accepts disease candidates (snake_case `disease`, old rows still parse, corrupt → `[]`), JSON readers for species/treatment/question with safe defaults. `plantsRepo`: `listUnfinishedScans`; `listPlants` uses `candidateName` source data. | `storage/scansRepo.ts`, `storage/plantsRepo.ts` |

### Phase 4: App session (depends on 2 for the local stack; highest risk)

| # | Task | Files |
|---|---|---|
| 14 | `SessionUser.isAnonymous`; store maps anonymous → guest (signed_in, refreshed, refreshAccount). Fake auth server gains anonymous sign-in. | `backend/session.ts`, `account/store.ts`, `testing/fakeAuthServer.ts` |
| 15 | `ensureScanSession`: existing → stash → new anonymous; offline → `offline`; stash written in `setSessionFromAuth` when an anonymous session is replaced; stash key outside the `rebloom-auth-` prefix. Tests: fresh install → one anonymous user, no UI event as signed in; email sign-in → sign-out → `ensureScanSession` → same anonymous id; late verify after sign-out still obeys `signInSequence`; sign-out offline still immediate; stash survives `removeSessionKeys`; a revoked stash → new anonymous user. | `backend/session.ts`, `backend/__tests__/session.test.ts` |
| 16 | `backend/diagnose.ts` (`postDiagnose`, `getDiagnose`, `confirmDiagnose`; statuses → typed results; 409 retried 5× at 2 s; one 401 retry after `ensureScanSession`). Add to the guard allowlist with the scan files that now reach it. | `backend/diagnose.ts`, `__tests__/guards.test.ts`, `testing/fakeDiagnoseServer.ts` |

### Phase 5: App flow (depends on 3, 4)

| # | Task | Files |
|---|---|---|
| 17 | `kindwiseDiagnoser` + engine swap (`kindwise-v1` when the backend is configured, fake otherwise, still "Demo"). | `diagnosis/kindwiseDiagnoser.ts`, `diagnosis/engine.ts` |
| 18 | `runDiagnosis`: `scanId` passed, 20 s, new error kinds carrying `resetsAt`; `saveScan`: pending row + photo before the call, `ready` after, `deleteUnsavedScan` when the flow closes without save; confirm call after `ready`. | `scan/runDiagnosis.ts`, `scan/saveScan.ts` |
| 19 | Scan session: `question`, `questionAnswer`, `finish()` applies both re-ranks; unmount keeps `pending` rows, deletes unsaved `ready` ones. | `scan/session.tsx` |

### Phase 6: Screens (depends on 5)

| # | Task | Files |
|---|---|---|
| 20 | Analyzing: new step/pill/footer copy, slow line at 8 s (announced once, reduced motion → no fade), error kinds → screens: not-a-plant, quota, offline/server/busy ErrorState copy, "Scan later". | `app/scan/analyzing.tsx`, `scan/components/NotPlantScreen.tsx`, `scan/components/QuotaScreen.tsx` |
| 21 | Questions: Kindwise step first, "1 of 4", Back order, plain text, wraps. | `app/scan/questions.tsx` |
| 22 | Result: species line + "species match", "Diagnosis confidence" label, unmapped name + description subtitle without severity pill, healthy / healthy-unsure, long names (2 lines + full a11y label), chip copy, no Demo for `kindwise-v1`, scans-left line. | `app/scan/result.tsx` |
| 23 | Save pre-fill (common → scientific → empty; select on focus); FeedbackSheet guess list from `candidateName`. | `scan/components/SaveSheet.tsx`, `scan/components/FeedbackSheet.tsx` |
| 24 | My Plants: unfinished rows (finishing / ready (D6) / needs retry), `resumePending` on focus (single flight, never at start), tap actions; design doc row 9 updated for D6. | `scan/resumePending.ts`, `app/(tabs)/plants.tsx`, `plants/components/PlantRow.tsx` |

### Phase 7: Docs, privacy, verification (depends on 6)

| # | Task | Files |
|---|---|---|
| 25 | Privacy page names Kindwise (photo, no location, deleted once you have the result); its test first. | `landing/src/pages/PrivacyPage.tsx`, `PrivacyPage.test.tsx` |
| 26 | `app/README.md`: Kindwise, anonymous accounts, local function + fake setup, "no key in the app". Static check: no `KINDWISE` / `plant.id` string anywhere under `app/src` except tests. | `app/README.md`, `__tests__/guards.test.ts` |
| 27 | Integration: `scan-flow.test.tsx` end to end on the fake server (happy, question, healthy, not-a-plant, quota, offline, kill → pending → My Plants → ready); `my-plants.test.tsx` unfinished rows; old fake scans still render. | `__tests__/scan-flow.test.tsx`, `__tests__/my-plants.test.tsx` |
| 28 | fast-check: (a) any generated Kindwise body (missing, extra, wrong-typed, NaN fields) → `mapResult`/`kindwiseMap` never throw, never yield a non-low result from a top probability < 0.50, top 3 max; (b) any answer sequence never clears the low flag; (c) merge never raises the top above the raw maximum. | `__tests__/properties.test.ts`, `supabase/tests/diagnose-mapping.test.mjs` |
| 29 | Break-test report (§3a.3), then stop for Sanket. After agreed fixes: adversarial swarm offered (high risk). | report only |

### Parallel vs sequential

| Parallel group | Tasks | Why |
|---|---|---|
| A | 1–8 (server) and 9–13 (app data) | No shared files |
| B | 9, 12 | Types and SQLite migration are independent |
| C | 20, 21, 22, 23 | Separate screens once Phase 5 lands |
| D | 25, 26 | Docs |

| Sequential | Depends on | Why |
|---|---|---|
| 3 → 6 → 7 | 1, 2 | Function needs the tables, config and caller |
| 14 → 15 → 16 | 2 | Local stack with anonymous sign-ins |
| 10, 11 | 9 | Types first |
| 13 | 9, 12 | New columns and candidate shape |
| 17 → 18 → 19 | 10, 13, 16 | Diagnoser over backend and storage |
| 24 | 13, 18 | Pending rows exist |
| 27, 28 | 20–24 | Whole flow |
| 29 | all | Break-test after green |

---

## Testing plan (traced to the spec)

| Layer | Tests | Spec item |
|---|---|---|
| Data (server) | T1 pgTAP: RLS, grants, own-row read, counting, quota, cap, stale lock, release rules, rollover, cascade | Data Model; edges 5, 6, 7, 13, 15 |
| Data (app) | T12 migration on v1 rows; T13 repo round-trips, tolerant parsing | Old fake scans render; edge 10 |
| Logic | T4 validate/map; T10 mapping/merge/healthy/species; T11 question re-rank; T15 session | Edges 1, 2, 3, 10, 14, 17 |
| API / integration | T6/T7 local stack + fake Kindwise; T16 fake server in jest; T27 flow | Edges 1, 4, 5, 6, 7, 8, 9, 11, 12, 16; happy path |
| UI | T20–T24 screens: copy, a11y labels, announcements, Android Back, 200% text | Design 1–10 |
| Mass | T28 fast-check; T29 break-test + swarm offer | review.md high risk |
| Static | No key or plant.id URL in `app/src`; config pins | "Key appears nowhere in the app" |

Device checklist (to `.handoff/`, not blocking): real Kindwise call on a trial key with 5 real photos (sick, healthy, not a plant, blurry, unusual species); kill the app mid-call on Android and iOS, then open My Plants; airplane mode on Analyzing; VoiceOver/TalkBack on the new screens.

---

## Risks

| Risk | Mitigation |
|---|---|
| Session stash breaks the late-sign-in guards or brings a signed-out session back | Restore only through `setSessionFromAuth`; stash key outside the cleared prefix; T15 covers sign-out offline, late verify, revoked stash. Read `.planning/plans/accounts.md` risks before T14 |
| Anonymous users are role `authenticated`: any future synced table with the README template lets them write rows | Note in README now; the sync spec decides `is_anonymous` checks |
| Double charge on retries or double taps | Row lock in `begin_diagnosis`; D1 confirm; concurrency test in T6 |
| Credits drained by many anonymous accounts (30/h/IP) or reinstalls | Daily credit cap (D3 counts real spend); attestation stays backlog |
| Kindwise disease names for our 7 conditions not verified | T10 first step reads the class list; unknown names stay unmapped (honest, never mis-mapped) |
| Merging Kindwise diseases into one condition raises confidence | Max not sum (T10), property T28c |
| Kindwise response shape drifts (`treatment` string vs array, missing fields) | Accept both; safe defaults; property T28a |
| App start sends a request (resume) | D4: resume on My Plants focus; root-layout test unchanged |
| Photo leaves the phone with location | `preparePhoto` already strips EXIF; never send `latitude/longitude` (asserted on the fake in T6) |
| Production auth setting drifts from local | D8 dashboard tick in the PR, `config.test.mjs` pins local |
| Trial credits (100) used up by testing | All automated tests use the fake; real calls only in the device checklist; more credits only with Sanket's yes |

---

## Before build (Sanket)

- Confirm or change D1–D8.
- Kindwise account and API key; `supabase/functions/.env` locally, `supabase secrets set KINDWISE_API_KEY=…` on production only after the PR is merged. No credit purchase without an explicit yes.
- Pick `daily_cap` (suggested 40 credits/day on the trial).

---

## Gate 2

**Architecture**
- [x] Follows existing patterns: Edge Function like `delete-account` (own token check, `verify_jwt` off, 401/503 split); migration + pgTAP per `supabase/README.md`; app reaches Supabase only through `src/backend/`; routes in `src/app/`, logic outside; fakes in `src/testing/`; tokens only
- [x] Each layer calls only the one below: routes → scan services → diagnosis/storage → backend → function → SQL / Kindwise
- [x] Production changes only after merge: `db push --remote`, `functions deploy`, `secrets set`, dashboard tick (D8)

**Task breakdown**
- [x] All files to change are listed
- [x] All new files are listed with locations
- [x] Each task ≤ 3 files (plus its tests) and one commit
- [x] Dependencies clear; parallel groups marked
- [x] Spec deviations named as decisions (D1–D8) for Sanket to confirm

**Testing**
- [x] Data layer: pgTAP (T1), SQLite migration and repos (T12, T13)
- [x] Business logic: validate/map, mapping, re-rank, session (T4, T10, T11, T15)
- [x] API / integration: local stack with fake Kindwise (T6, T7), jest fake server and full flow (T16, T27)
- [x] UI: every new and changed screen (T20–T24)
- [x] All 17 spec edge cases mapped in the testing plan; fast-check and break-test for high risk (T28, T29)
