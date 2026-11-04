# Plan: Accounts, phase 1 (email code, account screens, sign out, delete account)

**Spec**: .planning/specs/accounts.md (phase 1 only; phases 2 Google and 3 Apple get their own plans)
**Epic**: Cloud backup of plants (step 2 of 3)
**Created**: 2026-11-04
**Status**: draft
**Risk**: high (sign-in, a user locked out, account deletion, a server function with admin rights)
**Depends on**: `.planning/plans/supabase-foundation.md` (done; branch `feature/supabase-foundation`, PR SanketLV/rebloom#12)

**Stack**: Expo SDK 58 · Expo Router · supabase-js 2.118 (foundation's `app/src/backend/`) · Supabase CLI v3 local stack · Edge Functions on Deno with `npm:@supabase/server@1.9.2` · landing: Vite + React.

**Facts checked (2026-11-04)**
- **Sign-in by code**: `signInWithOtp({ email, options: { shouldCreateUser: true } })` sends the code; `verifyOtp({ email, token, type: 'email' })` returns the session. With email confirmation on (local `config.toml`, hosted default) this works for brand-new addresses too: the foundation's local API tests pass on Sanket's stack.
- **One error for a wrong and an expired code**: Supabase Auth's error codes (auth-js 2.118 `error-codes.d.ts`) have `otp_expired` and no separate "invalid code". The spec and design (18b `status` tweak) show "That code isn't right" and "That code has expired" separately. **Task 1 checks on the local stack** what a wrong code and an expired code each return; if they can't be told apart, both show one message: "That code isn't right or has expired. Check the email or send a new one." (spec and design updated in the same task).
- **Edge Functions with the new API keys** (Supabase docs, "Migrating to publishable and secret API keys"): the built-in `verify_jwt` only understands legacy JWT keys, so set `verify_jwt = false` for the function and authorize in code. Recommended: `withSupabase({ auth: 'user' }, handler)` from `npm:@supabase/server`, which validates the user's token and gives `ctx.userClaims` (the caller's `sub`) and `ctx.supabaseAdmin` (secret key, from `SUPABASE_SECRET_KEYS`). `auth.admin.deleteUser(id)` deletes the user.
- **The app's call**: `supabase.functions.invoke('delete-account')` sends the session's access token as `Authorization: Bearer` and the publishable key as `apikey`. Errors are `FunctionsHttpError` (non-2xx; the `Response` is in `context`), `FunctionsFetchError` (network), `FunctionsRelayError`.
- **Design**: canvas "Rebloom App Screens", artboards 16 (Settings account card, three states), 18 (Sign in), 18a (email), 18b (code), 18c (Account), Sheet · Sign out, Sheet · Delete account (ready / deleting / failed). Colours on the Settings card not yet in `tokens.ts`: `#CBD4C2` (card subtitle), `#3F5236` (avatar circle and "Account" button), `#F3F4EC` (card text); the rest are existing tokens.
- **Production email** needs a domain (Resend sends only from a verified domain you own). There is none yet, so phase 1 is built and tested on the local stack (Mailpit) and ships to production only after task 18. Resend and Cloudflare connectors are linked; Resend has no domains yet; the landing page is the Cloudflare Worker `rebloom-landing` on `workers.dev`.
- **To verify during the build** (then pinned by tests): which `TextInput` props make iOS and Android offer the code from the email (`textContentType="oneTimeCode"`, `autoComplete="one-time-code"`, device check); `AccessibilityInfo.announceForAccessibility` for the resend countdown on iOS (review rule); `@supabase/server`'s exact `ctx` shape in 1.9.2 (read its README in the package before task 9).

---

## Architecture

```
src/app/settings.tsx                 Settings: placeholder + the account card (only when the backend is configured)
src/app/account/_layout.tsx          Stack for the account screens
src/app/account/index.tsx            18c Account (signed in only; otherwise redirects to sign-in)
src/app/account/sign-in.tsx          18 Sign in (phase 1: "Continue with email" only)
src/app/account/email.tsx            18a email
src/app/account/code.tsx             18b code
src/accounts/                        UI-side logic, no Supabase imports
  email.ts        normalizeEmail, emailLooksValid (review rule: \p{Cf}, trim, lowercase)
  code.ts         cleanCode (digits only, at most 6)
  copy.ts         every user-facing message, by error code
  useAccount.ts   { state: 'loading' | 'guest' | 'signed_in' | 'signed_out', user } from the session module
  components/     AccountCard, SignOutSheet, DeleteAccountSheet, CodeField
src/backend/                         (foundation) + two new modules
  emailCode.ts    sendEmailCode(email), verifyEmailCode(email, code) → Result
  deleteAccount.ts deleteAccount() → Result (calls the Edge Function, then signs the phone out)
supabase/functions/delete-account/index.ts   withSupabase({ auth: 'user' }): deletes the caller, 204
landing/src/pages/PrivacyPage.tsx            "App accounts" section
```

- **Layers**: screens → `src/accounts/` (hooks, copy, components) → `src/backend/` (only these may import supabase-js). The screens that call the backend are added to `ALLOWED_BACKEND_IMPORTERS` one by one, on purpose (the foundation's import guard).
- **Sign-in flow**: email screen normalizes and checks the address → `sendEmailCode` → code screen. At 6 digits (typed, pasted or filled by the keyboard), and on "Continue", `verifyEmailCode` runs once (single-flight) → `setSessionFromAuth(client.auth.verifyOtp(...))` (the call itself, as the foundation requires) → back to Account. The code screen keeps the email in the route params, not in storage.
- **Errors**: a new backend code `code_rejected` (for `otp_expired` / `invalid_credentials` from verify), added to the foundation's closed set; every code has one line of copy in `copy.ts`; raw Supabase text never shows.
- **Signed-out vs guest**: `useAccount` remembers a `session_expired` event for the rest of the app run, so the Settings card shows "Signed out · Sign in again to keep your account" instead of "Guest". After a restart it's "Guest" (accepted: nothing is lost on the phone).
- **Delete account**: the sheet calls `deleteAccount()`. Success → `signOut()` locally (the server already forgot the session; a `session_not_found` answer counts as ok) → Settings shows "Your account is deleted." 204 is also success when the user was already gone. Offline / 5xx → the sheet's failed state, still signed in.
- **App start**: the foundation's "no request on app start" guarantee changes, on purpose: with **no stored session**, opening the app and Settings still sends nothing; with a stored session whose access token has expired, the Settings card's `getCurrentUser` may refresh it (expected for a signed-in user). The root-layout test is split into those two cases.

## Files

New: everything listed under Architecture, plus `supabase/tests/local/delete-account.test.mjs`, `app/src/accounts/__tests__/*`, `app/src/backend/__tests__/emailCode.test.ts`, `deleteAccount.test.ts`, screen tests in `app/src/__tests__/account-*.test.tsx`.

Changed: `app/src/backend/errors.ts` (+ `code_rejected`), `app/src/testing/fakeAuthServer.ts` (`/auth/v1/otp` and `/functions/v1/delete-account` routes), `app/src/theme/tokens.ts` (three card colours), `app/src/components/icons.tsx` (mail, person, chevron, trash, alert icons from the artboards), `app/src/__tests__/guards.test.ts` (`ALLOWED_BACKEND_IMPORTERS`), `app/src/__tests__/root-layout.test.tsx`, `supabase/config.toml` (`[functions.delete-account] verify_jwt = false`), `landing/src/pages/PrivacyPage.tsx` (+ its test), `.planning/specs/accounts.md` and the design canvas (task 1, if wrong and expired codes can't be told apart).

## Tasks

Each task is one commit, test first. Branch: `feature/accounts` off `feature/supabase-foundation` (or off `develop` once SanketLV/rebloom#12 is merged).

### Phase 0: facts and tokens

| # | Task | Test (written first) |
|---|---|---|
| 1 | On the local stack: send a code, then verify a wrong code and (with `otp_expiry` lowered to 5 s in a scratch config) an expired one; record both answers in this plan. Update spec + design copy if they can't be told apart | A local API test pins the answers (T1) |
| 2 | Card colours in `tokens.ts` | Tokens test; the no-hex guard |

### Phase 1: logic (no UI)

| # | Task | Test |
|---|---|---|
| 3 | `normalizeEmail`, `emailLooksValid` (same rules as the server's `waitlist_email_ok`: ≤254, local part ≤64, one `@`, a dot in the domain) | T2 (property) |
| 4 | `cleanCode` | T3 (property) |
| 5 | `code_rejected` in `errors.ts`; `copy.ts` | T4 |
| 6 | `sendEmailCode`, `verifyEmailCode` (fake server: `/otp`, `/verify`) | T5 |
| 7 | `deleteAccount` (fake server: function route) | T6 |
| 8 | `useAccount` | T7 |

### Phase 2: the server function

| # | Task | Test |
|---|---|---|
| 9 | `supabase/functions/delete-account` with `withSupabase({ auth: 'user' })`: deletes `ctx.userClaims.sub`, ignores the body, 204 (also when the user is already gone), 401 without a valid token; `verify_jwt = false` in `config.toml`. The backup spec extends it to remove photo files | T8 (local stack, `supabase functions serve`) |

### Phase 3: screens (design artboards)

| # | Task | Test |
|---|---|---|
| 10 | Icons, `CodeField`, `AccountCard` (3 states), sheets | T9 |
| 11 | Settings card; hidden when the backend isn't configured | T10 |
| 12 | `/account/sign-in` (email only in phase 1), `/account/email` | T11 |
| 13 | `/account/code`: auto-verify, Continue, 60 s resend with an announced countdown, errors, "Use a different email" | T12 |
| 14 | `/account`: email + method, Sign out sheet, Delete sheet (ready / deleting / failed); redirect to sign-in when signed out | T13 |
| 15 | Navigation: Android Back on each screen; deep link to `/account` signed out | T14 |
| 16 | Guards: `ALLOWED_BACKEND_IMPORTERS` lists exactly the account screens; root-layout test split (no session → no request; expired session → refresh allowed) | T15 |

### Phase 4: landing and production

| # | Task | Test |
|---|---|---|
| 17 | Landing privacy page: "App accounts" (what's stored: email, sign-in method, account dates; processors: Supabase, Resend; delete in the app or by email to the page's contact address) | The landing's page test checks the section and the deletion route |
| 18 | **Production, with Sanket, blocked on a domain:** Resend domain `auth.<domain>` and DNS (Sanket approves; Cloudflare "Auto configure"); verify; a sending-only key for that domain; Sanket enters it in Supabase → Authentication → SMTP (never in chat or the repo); templates and `otp_expiry` 600 copied to the dashboard; email rate limit sized for launch; deploy `delete-account` (`supabase functions deploy delete-account`); a real code sign-in and a delete from a development build | Checklist in the PR; Resend shows the email `delivered` |

No payment and no delete on any account without asking Sanket first (root `CLAUDE.md`). The tests' own users on the **local** stack are created and deleted by the tests; ask before running anything that deletes data anywhere else.

## Testing plan

| ID | Test | Spec trace |
|---|---|---|
| T1 | Local stack: a wrong code and an expired code each give the recorded answer; a code works once | Edge 3, 4 |
| T2 | Property: normalization is idempotent, leaves no `\p{Cf}`, no outer spaces, no capitals; an address with invisible characters added normalizes to the same one; `emailLooksValid` never accepts what the server's `waitlist_email_ok` rejects (same inputs, same answer) | Edge 1; review rule |
| T3 | Property: `cleanCode` returns only digits, at most 6, for any pasted string ("123 456", "123-456", emoji, full-width digits) | Edge 2 |
| T4 | Every backend code has copy; no copy contains raw Supabase text | Errors |
| T5 | `sendEmailCode`: one request with the normalized address and `create_user: true`; 429 → `rate_limited`; offline → `offline`. `verifyEmailCode`: success → `signed_in` once; `otp_expired` → `code_rejected`; double call → one request | Email sign-in; edges 5, 7, 15 |
| T6 | `deleteAccount`: 204 → signed out, plants untouched; 401 → `session_expired`; offline → `offline`, still signed in; 5xx → `unknown` | Delete; edge 16 |
| T7 | `useAccount`: guest → signed_in → signed_out (user) → guest; `session_expired` → `signed_out` until restart | Account screens; edge 17 |
| T8 | Local stack: no token → 401; A's token with B's id in the body → only A deleted; twice → 204 both; A's rows in a template table removed (cascade) | Delete; API rules |
| T9 | Components: labels, roles, 44 pt targets; `CodeField` passes the one-time-code props; sheets trap focus and close on Android Back | A11y |
| T10 | Settings card: three states; absent when not configured | Edge 19 |
| T11 | Email screen: "Send code" disabled until valid; a messy address is sent normalized; offline / rate-limited copy | Edges 1, 5, 7 |
| T12 | Code screen: 6 typed digits verify once; Continue does the same; paste cleaned; wrong / expired copy, field cleared and focused; resend disabled 60 s (fake timers) and announced; "Use a different email" | Edges 2–6, 8, 15 |
| T13 | Account screen: shows email and "Signed in with email"; Sign out → confirm → Settings, plants and photos untouched; Delete → deleting (busy, announced) → Settings with "Your account is deleted."; failed state keeps the user signed in | Sign out; delete; edge 16 |
| T14 | Android Back: code → email → sign-in → Settings; `/account` signed out → sign-in | Edge 18 |
| T15 | Only the listed account files reach `src/backend`; no request on app start without a stored session | Foundation guards |

Device checklist (added to `.handoff/device-checklist.md`): the code email lands in the inbox (Gmail, Outlook, iCloud) once production email exists; iOS and Android offer the code from the email; VoiceOver and TalkBack hear the countdown and the busy states; 200% text on an iPhone SE; Android Back everywhere.

## Risks

| Risk | Mitigation |
|---|---|
| Wrong and expired codes can't be told apart | Task 1 checks first; one combined message if so (spec and design updated) |
| `@supabase/server` 1.9.2's `ctx` differs from the docs | Read its README in the package before task 9; T8 runs the real function on the local stack |
| The Settings card makes app start send a request for signed-in users | Intended; T15 pins that a phone with no session still sends nothing |
| Production email can't be set up without a domain | Phase 1 is complete and tested locally; task 18 waits for the domain; accounts don't ship to a store build before backup anyway (spec release rule) |
| A signed-in user with no network sees stale "signed in" | `getSession` answers within 10 s; the card shows the stored user, and actions report `offline` |

---

## Gate 2

**Architecture**
- [x] Follows the existing patterns (routes in `src/app`, logic outside, fakes in `src/testing`, tokens only in `src/theme`)
- [x] Layers: screens → `src/accounts` → `src/backend`; only listed screens import the backend (guarded)
- [x] The server function authorizes the caller itself (`verify_jwt = false` is required with the new keys)

**Task breakdown**
- [x] Files to change and create are listed
- [x] Tasks are small, one commit each, test first
- [x] The production task is separate, with Sanket, and blocked on the domain

**Testing**
- [x] Logic (T2–T8, with property tests), screens (T9–T14), integration on the local stack (T1, T8), guards (T15)
- [x] Phase 1 edge cases traced: 1 → T2, T11 · 2 → T3, T12 · 3, 4 → T1, T12 · 5 → T5, T11 · 6 → T12 · 7 → T5, T11 · 8 → T12 · 15 → T5, T12 · 16 → T6, T13 · 17 → T7 · 18 → T14 · 19 → T10 · 20 → T9 + device. (9–14 are Google and Apple, phases 2–3.)

**Result: PASSED**
