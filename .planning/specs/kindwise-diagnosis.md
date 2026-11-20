# Spec: Kindwise diagnosis (species + disease)

**Created**: 2026-11-20
**Status**: draft
**Author**: Sanket
**Epic**: none (followed by the `treatment-plan` spec)
**Risk**: high (paid credits, user photos sent to a third party, health advice shown as confident, a server function holding a secret key, a new local DB migration)

**Sources**: Kindwise pages (pricing, FAQ, plant.health, "New feature: follow-up questions", agents OpenAPI) read through search on 2026-11-20; kindwise.com did not load from this machine, so every Kindwise fact marked *verify* is checked against docs.kindwise.com in the plan step · `.planning/specs/scan-diagnosis.md` (the flow and data model this spec replaces the fake in) · `.planning/specs/accounts.md` (session module, Edge Function pattern) · `supabase/README.md` (table and function rules)

---

## Problem

Every scan today goes to `fakeDiagnoser`, which picks one of 8 canned answers from the photo's file size. The app's core promise ("snap a photo, find out what's wrong") isn't true yet: someone with a sick plant gets a made-up diagnosis tagged "Demo", and the plant's species isn't identified at all. Rebloom is for people who have been burned by apps that give one confident, wrong answer, so the real diagnosis must stay honest about uncertainty.

## Goal

A scan sends the photo to Kindwise (plant.id with `health=all`) through a Supabase Edge Function and shows the real species and the real problem, with honest confidence. The Kindwise key never reaches the phone. Each account gets 3 free scans per calendar month (UTC); failed or not-a-plant scans don't count. A global daily cap bounds the worst-case spend. Kindwise's treatment notes are saved with the scan for the `treatment-plan` spec. `typecheck`, `lint`, `test` and the backend tests pass.

## Decisions

- **One spec for species + disease; treatment plan separate** (2026-11-20). One Kindwise call returns both (2 credits). The "08 Treatment" screen is the next spec; this one only stores the treatment notes.
- **Anonymous Supabase sign-in for scanning** (2026-11-20). The first scan creates an account with no email, invisible to the user, so the server can limit per account with a token it can trust. "No account, no card" stays true from the user's side.
- **3 free scans per month, full answers** (2026-11-20). Free scans get the whole result (species, diagnosis, treatment notes). Nothing is hidden behind a paywall mid-answer. Payments are a later spec; this one only counts and shows a "used your free scans" screen. The limit is one server-side constant.
- **Signing out returns to the original anonymous account** (2026-11-20). The anonymous session is kept aside on sign-in and restored on sign-out, so switching accounts never hands out a fresh 3. Reinstalling still does; the global daily cap bounds it, device attestation is backlog.
- **No job service for killed apps** (2026-11-20). Kindwise keeps identifications and returns them for free by `access_token`. The server keeps only `(user_id, scan_id, access_token)` until the app fetches the result, then deletes the identification at Kindwise and the row. No trigger.dev.
- **Kindwise follow-up question in scope; multiple photos later** (2026-11-20). When Kindwise returns its yes/no question, it's shown before our 3 questions. The server accepts a list of images; the app sends 1 until real one-photo results have been judged.

## User Stories

- As a **plant owner with a sick plant**, I want a photo to tell me the real problem with an honest confidence, so I act on something true, not a demo answer.
- As a **plant owner who doesn't know the plant's name**, I want the species named from the same photo, so I can save it under its real name.
- As a **plant owner on a weak or no connection**, I want a clear "can't diagnose without internet" and my photo kept, so I can try again later without retaking it.
- As a **plant owner whose photo isn't a plant**, I want to be told to retake it, not given a confident wrong answer.
- As the **app owner**, I want the Kindwise key on the server and scans limited per account with a global daily cap, so nobody can drain the credits.

## Requirements

### Must have

**Server**
- Edge Function `diagnose`, the only holder of `KINDWISE_API_KEY` (function secret).
  - Reads the caller from their own token (`Authorization`), as `delete-account` does. Anonymous accounts are accepted. No token or a bad one → `401`.
  - Body: `{ "scan_id": "<uuid>", "images": ["<base64 jpeg>"] }`. 1 to 3 images accepted, the app sends 1. Each image ≤ 2 MB decoded and a real JPEG (magic bytes), else `413` / `400`.
  - Idempotent per `(user_id, scan_id)`: a repeat while the first is running or after it finished returns the same result and is never charged or counted twice.
  - Order: check token → reserve 1 scan in `scan_usage` for the current UTC month (`429 quota_exceeded` if 3 used) → reserve 2 credits in `kindwise_daily_usage` (`503 daily_cap` if over) → call Kindwise (`health=all`, details: common names, description, treatment, *verify exact parameter names*) with a 20 s limit → map → respond.
  - Releases both reservations when Kindwise fails, times out, or returns `is_plant.binary = false`.
  - Stores no photo and no result. Keeps `(user_id, scan_id, access_token, created_at)` only until the result is fetched (then deletes the Kindwise identification and the row) or for 7 days at most (scheduled cleanup, *verify Kindwise delete endpoint is free*).
  - `GET diagnose?scan_id=…` returns the stored result for the caller's own scan (fetched from Kindwise by token, free), for the killed-app case. Another user's `scan_id` → `404`.
- Migration (rules in `supabase/README.md`: owner-only RLS, no `using (true)`, new functions revoked from `public, anon, authenticated`):
  - `scan_usage (user_id uuid, month date, count int, unique (user_id, month))`: owner can read own rows only.
  - `kindwise_daily_usage (day date primary key, credits int)`: no app access.
  - `diagnosis_requests (user_id uuid, scan_id uuid, access_token text, created_at timestamptz, unique (user_id, scan_id))`: no app access.
  - Security-definer functions for reserve / release / record, called by the Edge Function only. `MONTHLY_FREE_SCANS = 3` and `DAILY_CREDIT_CAP` live in one place.
- Anonymous sign-ins enabled in `supabase/config.toml` and on production through the reviewed config, not the dashboard.

**App**
- `kindwiseDiagnoser` replaces `fakeDiagnoser` in `src/diagnosis/engine.ts` (the one swap point). `diagnoser_id = 'kindwise-v1'`. The fake stays for tests and for builds with no backend configured, still tagged "Demo".
- Diagnosis types widen: a candidate is either one of our 7 `ConditionId`s or a Kindwise disease `{ id, name, common_names }`. A fixed mapping turns known Kindwise care problems (water excess, water deficiency, light, sunburn, mites, root rot; *verify Kindwise names*) into our 7 so our 3 questions still re-order them; unmapped diseases keep Kindwise's name and our questions don't move them.
- Before scanning, the app makes sure there is a session: the existing one, or a new anonymous one (`signInAnonymously`). On sign-in with email, the anonymous session is stored aside; on sign-out it's restored instead of creating a new anonymous account.
- Kindwise follow-up question: if present, one extra Questions step before ours, answers Yes / No / Not sure. The answer re-orders using Kindwise's `yes` / `no` lists. Answers never raise confidence above the photo's own low-confidence flag (review.md rule).
- Low confidence: top disease < 0.50 or top species < 0.30 → "We're not sure yet" (thresholds in one place).
- Healthy (`is_healthy.binary = true`) → "Looks healthy" result, species shown, no treatment.
- Result shows the species (scientific name, first common name) and the diagnosis; saving a plant pre-fills the name with the common name (editable).
- Local migration 2 on `scans`: `species TEXT` (JSON), `treatment TEXT` (JSON), `kindwise_question TEXT` (JSON), `question_answer TEXT` (`yes | no | not_sure`), `status TEXT NOT NULL DEFAULT 'done'` (`pending | done`). Existing rows keep working.
- A scan whose call was cut off is saved as `pending`; on next launch the app asks `GET diagnose?scan_id` and finishes it, or offers Try again if the server has nothing.
- Error screens: not a plant (Retake), offline / timeout (photo kept, Try again), quota (`You've used your 3 free scans this month. They reset on 1 Dec.` in local date format), daily cap ("Diagnosis is busy today, try again tomorrow").
- Privacy page and `app/README` name Kindwise as a processor of the photo.
- Kindwise text is shown as plain text only.

### Nice to have
- Show `scans_left` on the Result screen ("2 free scans left this month").
- A second photo ("add a closer look") once one-photo results have been judged.

### Out of scope
- The treatment plan screen ("08 Treatment" stays a placeholder; notes are only stored). → `treatment-plan` spec.
- Payments, subscriptions, paywall.
- Linking the anonymous account's scans into an email account.
- Cloud backup or sync of plants, scans, photos.
- Offline / on-device diagnosis.
- More than one photo per scan in the app.
- Insect, mushroom and crop identification. **Backlog.**
- Device attestation (App Attest / Play Integrity) against reinstall abuse. **Backlog.**
- Translations (English only).

## Data Model

### Supabase (new migration)

```sql
create table public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,               -- first day of the UTC month
  count int not null default 0 check (count between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.scan_usage enable row level security;
create policy "own usage" on public.scan_usage for select using (auth.uid() = user_id);

create table public.kindwise_daily_usage (
  day date primary key,              -- UTC
  credits int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.kindwise_daily_usage enable row level security;  -- no policies: no app access

create table public.diagnosis_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null,
  access_token text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, scan_id)
);
alter table public.diagnosis_requests enable row level security;    -- no policies: no app access
```

The `auth.users` reference with `on delete cascade` follows the foundation's pattern for user-owned rows (deleting an account removes them). These are server-only counters, not synced app tables, so they skip the app-table `id` / `deleted_at` columns. Grants: revoke everything from `anon` and `authenticated`, then give `authenticated` only `select` on `scan_usage` (`grants.test.sql` must still pass). Functions: `reserve_scan(user_id)`, `release_scan(user_id)`, `reserve_credits(n)`, `release_credits(n)`: security definer, `search_path = ''`, revoked from `public, anon, authenticated`, granted to `service_role`.

### App (local SQLite, migration 2)

```sql
ALTER TABLE scans ADD COLUMN species TEXT;            -- JSON [{ "name", "common_names", "probability" }], top 3
ALTER TABLE scans ADD COLUMN treatment TEXT;          -- JSON { "<disease id>": { "prevention": [], "biological": [], "chemical": [] } }
ALTER TABLE scans ADD COLUMN kindwise_question TEXT;  -- JSON { "text", "yes": [ids], "no": [ids] }
ALTER TABLE scans ADD COLUMN question_answer TEXT;    -- yes | no | not_sure
ALTER TABLE scans ADD COLUMN status TEXT NOT NULL DEFAULT 'done';  -- pending | done
```

`model_result` / `final_result` candidates gain `name` and `common_names` for Kindwise diseases (snake_case JSON). Old fake rows have none and still render.

## API Changes

### `POST /functions/v1/diagnose`

Request (`Authorization: Bearer <access token>`):
```json
{ "scan_id": "6f1c…", "images": ["/9j/4AAQSk…"] }
```

`200`:
```json
{
  "is_plant": { "probability": 0.98, "binary": true },
  "is_healthy": { "probability": 0.12, "binary": false },
  "species": [{ "name": "Monstera deliciosa", "common_names": ["Swiss cheese plant"], "probability": 0.91 }],
  "diseases": [{
    "id": "…", "name": "water excess or uneven watering", "common_names": [], "probability": 0.64,
    "description": "…",
    "treatment": { "prevention": ["…"], "biological": ["…"], "chemical": ["…"] }
  }],
  "question": { "text": "Is the soil wet?", "yes": ["…"], "no": ["…"] },
  "scans_left": 2,
  "resets_at": "2026-12-01T00:00:00Z"
}
```
`question` is `null` when Kindwise sends none. Top 3 species and diseases only.

Errors (`{ "error": { "code", "message" } }`, project shape):

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | body not JSON, no `scan_id`, 0 or > 3 images, not a JPEG |
| 401 | `unauthorized` | no token, bad token |
| 413 | `image_too_large` | an image > 2 MB decoded |
| 422 | `not_a_plant` | `is_plant.binary = false` (not counted) |
| 429 | `quota_exceeded` | 3 scans used this month; body has `resets_at` |
| 502 | `upstream_failed` | Kindwise error or timeout (not counted) |
| 503 | `daily_cap` | global credit cap reached (not counted) |

### `GET /functions/v1/diagnose?scan_id=…`

Same `200` body for the caller's own finished scan; `404` if there's nothing (never another user's).

## UI Changes

| Screen | Change | Design reference |
|---|---|---|
| Analyzing | Unchanged steps; the wait is now real (≤ 20 s) | Analyzing |
| Kindwise question | New step before our Questions, same layout, Yes / No / Not sure | Questions artboard |
| Result | Species line (scientific + common name); Kindwise disease names; no "Demo" tag for `kindwise-v1` | Result artboard |
| Result: healthy | "Looks healthy", species, no treatment button | Result artboard (new state) |
| Not a plant | Message + Retake | RetakeSheet |
| Out of free scans | Message with reset date, photo kept | new, simple text screen |
| Offline / busy | Existing error state with new copy | ErrorState |
| Save sheet | Name pre-filled with common name | SaveSheet |
| My Plants | Unfinished scans show "Finishing…" until resolved | My Plants row |

## Edge Cases

1. **Not a plant**: Retake screen, no diagnosis, not counted.
2. **Low confidence**: "We're not sure yet"; answers re-order but never raise confidence above that flag.
3. **Healthy plant**: "Looks healthy", species shown, no treatment.
4. **Offline / timeout (20 s)**: "Can't diagnose without internet", photo kept, Try again re-sends without a retake, not counted.
5. **Out of free scans**: quota screen with local reset date, photo kept.
6. **Daily cap**: "busy today" message, not counted.
7. **Double tap / retry during a call**: one Kindwise call, one scan counted (idempotent `scan_id`).
8. **App killed mid-call**: scan saved `pending`; next launch fetches the result free via `GET`, or offers Try again.
9. **Anonymous sign-in fails** (offline on first run): same as 4.
10. **Kindwise changes or drops a field**: missing fields → safe defaults, never shown as confident; text rendered as plain text.
11. **Photo privacy**: no GPS (already stripped by `preparePhoto`); photo sent only to Kindwise; Kindwise identification deleted after the result is fetched; privacy page updated.
12. **Huge image**: already resized to 800 px in the app; server refuses > 2 MB with `413`.
13. **Month rollover**: counts reset at 00:00 UTC on the 1st; the reset date shows in local format.
14. **Sign out**: returns to the original anonymous account and its used count; reinstall still resets (backlog: attestation).
15. **Account deleted**: `scan_usage` and `diagnosis_requests` rows go with it (cascade).
16. **Another user's `scan_id`** on `GET`: `404`, never their result.
17. **Kindwise returns more than 3 suggestions or unknown disease ids**: top 3 kept; unknown ids show Kindwise's name.

## Testing Criteria

### Happy path
- [ ] Photo of a sick plant → Analyzing → Kindwise question (when sent) → our questions → Result with species and disease, `diagnoser_id = kindwise-v1`, no "Demo" tag.
- [ ] Saving pre-fills the common name; the scan row has `species`, `treatment`, `kindwise_question`, `question_answer`, `status = done`.
- [ ] `scan_usage` goes 0 → 1 for that account and month; `scans_left` = 2.
- [ ] First scan on a fresh install creates an anonymous account with no UI.

### Edge cases (each pinned by a test)
- [ ] Not a plant → Retake, `scan_usage` unchanged, credits released.
- [ ] Kindwise 5xx / timeout → error state, photo kept, both reservations released.
- [ ] 4th scan in a month → `429`, quota screen with the local reset date.
- [ ] Daily cap → `503`, not counted.
- [ ] Two concurrent calls with the same `scan_id` → one Kindwise call, count +1.
- [ ] Killed mid-call → `pending` row → next launch `GET` finishes it; the Kindwise identification and `diagnosis_requests` row are deleted afterwards.
- [ ] `GET` with another user's `scan_id` → `404`.
- [ ] No token / bad token → `401`; 4 images → `400`; 3 MB image → `413`; PNG → `400`.
- [ ] Low-confidence result + answers never shows "confident" (property test, fast-check).
- [ ] Kindwise response with missing or extra fields maps to safe defaults (property test over generated responses).
- [ ] Sign in with email then sign out → back on the same anonymous account, same count.
- [ ] Old fake scans still render after migration 2.
- [ ] `supabase test db`: new tables have RLS, no `using (true)`, functions revoked from `public, anon, authenticated`; a user can read only their own `scan_usage`.
- [ ] The Kindwise key appears nowhere in the app bundle.

## Dependencies

- Kindwise account with API access (100 free trial credits; more only with Sanket's yes) and `KINDWISE_API_KEY` set as a function secret locally and on production.
- Supabase anonymous sign-ins enabled.
- Existing: session module and Edge Function pattern (`accounts`), `preparePhoto` (800 px, GPS stripped), Diagnoser interface and scan flow (`scan-diagnosis`).
- A dev build is not required: no new native modules.

## Open Questions (resolved in the plan step against docs.kindwise.com)

- Exact Kindwise v3 request: endpoint, `health=all`, `details` names for treatment / description / common names, `similar_images=false`.
- Whether extra images cost extra credits.
- The follow-up question's response shape and whether answering it is free.
- Whether an `async` create-then-fetch mode exists; whether delete-identification is free.
- Kindwise names for the care problems we map onto our 7 conditions.

## Gate 1

**Completeness**
- [x] Problem clearly stated
- [x] Goal specific and measurable (3 free scans, no key in app, failed scans not counted)
- [x] User stories (5)
- [x] Must-have / nice-to-have / out of scope
- [x] Out of scope section (with backlog items)

**Data model**
- [x] New tables have ids/keys and timestamps
- [x] Column types correct (`uuid`, `date`, `timestamptz`, `TEXT` JSON locally)
- [x] Deletion strategy: server rows cascade with the account, `diagnosis_requests` deleted after use / 7 days; local scans keep soft delete

**API design**
- [x] Endpoint follows the existing Edge Function pattern
- [x] Request / response examples
- [x] snake_case JSON

**Quality**
- [x] Edge cases (17)
- [x] Happy-path tests
- [x] Edge-case tests
- [x] Dependencies listed
