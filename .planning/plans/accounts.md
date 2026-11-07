# Plan: Accounts (email code, Google, Apple)

**Spec**: .planning/specs/accounts.md
**Epic**: Cloud backup of plants (step 2 of 3)
**Created**: 2026-11-07
**Status**: draft
**Risk**: high

**Stack**: Expo SDK 58 · TypeScript strict · Expo Router (typed routes, React Compiler) · jest-expo 58 + @testing-library/react-native 14 · fast-check · Supabase CLI v3 local stack (Docker, Mailpit, edge runtime) · Deno Edge Functions. New app dependencies: `expo-web-browser`, `expo-auth-session` (phase 2), `expo-apple-authentication` (phase 3), all through `npx expo install`.

**Branch**: `feature/accounts`, from `develop` at `cb5d37e`. The foundation is merged (PR 12, 2026-11-06) and its migrations are live on production. Each phase is its own PR into `develop`.

**Build notes, phase 1 (2026-11-07)**: tasks 1–23 done in `.worktrees/accounts`. Changes from the plan, each covered by tests:
- **One `/account` route instead of `/account/sign-in` + `/account`.** It shows the sign-in screen when signed out and the account when signed in. After a code sign-in the email and code steps are dismissed back to it, so Back from the account goes to Settings with nothing stale behind it.
- **`SessionUser.provider` now means the method used this time** (latest identity), instead of a new `method` field. Nothing read it before.
- **Two extra states**: `offline` (the session couldn't be checked: "Try again") and `loading`. The `expired` state is kept in memory only (a restart shows a guest).
- **Settings now reads the session when it opens.** `root-layout.test.tsx` still proves the app start and the tabs send nothing, and now expects the refresh once Settings opens.
- **No hero illustration on the sign-in screen** (artboard 18's image isn't in the app's assets yet); no privacy link under "Send code" (the landing page's public URL isn't known yet).
- **Device checklist** started at `.handoff/device-checklist.md` (the foundation's copy was never on this machine).

---

## Decisions for Sanket

The build can start without these. Each one blocks only the step named.

| # | Question | Blocks | Default if you don't choose |
|---|---|---|---|
| D1 | **Wrong code vs expired code.** **Confirmed 2026-11-07 (task 1):** a wrong code and a used code both get `403 otp_expired` "Token has expired or is invalid", so the app can't tell them apart. A second send within `max_frequency` gets `429 over_email_send_rate_limit`. | Task 2's messages | One message (taken): "That code isn't right or has expired. Check the email or send a new one." |
| D2 | **Sending address.** **Decided 2026-11-07:** the project Gmail `rebloom.plant@gmail.com` sends the codes through Gmail SMTP (`smtp.gmail.com:587`, an app password with 2-Step Verification on, typed into the dashboard by Sanket) until a domain is bought. Before the store release: a domain with SPF, DKIM and DMARC (`auth.<domain>`) and a service such as Resend. A domain is also needed for phase 3's Apple relay. | Store release | Gmail now, domain before release |
| D3 | **Email limits.** While on Gmail SMTP: Supabase's `email_sent` limit is 30/hour (Gmail allows about 500/day). It's raised with the move to a domain service. | Task 25 | 30/hour |
| D6 | **Contact address.** **Decided 2026-11-07:** `rebloom.plant@gmail.com` is the deletion-request and support address (privacy page, task 22; Google consent screen, phase 2). The privacy page's one `CONTACT` constant (`landing/src/pages/PrivacyPage.tsx`, the only place the old address appears) switches too, so the waitlist section uses it as well. | Task 22 | Decided |
| D4 | ~~**Apple Developer account** ($99/year).~~ **Decided 2026-11-07: phase 3 is paused until the app is built.** By the release rule, iOS shows email only until then (Google stays hidden on iOS). Testing on iOS waits too: there's no Mac, so no iOS simulator. | Phase 3 | Paused |
| D5 | **Screen naming.** In the spec's edge cases, "Account" means the sign-in screen when signed out, and the account screen when signed in. The plan uses `/account/sign-in` and `/account` for these. | Nothing (naming only) | As planned. |

---

## Facts checked (2026-11-07)

- **Expo SDK 58 `expo-web-browser`**: `openAuthSessionAsync(url, redirectUrl, options)` resolves to `{ type: 'success', url }` or `{ type: 'cancel' | 'dismiss' }` (`opened` and `locked` exist in the enum). On Android the browser is a Chrome Custom Tab. The docs don't say what happens if Android kills the app while the browser is open, which is why `/auth/callback` exists.
- **Expo SDK 58 `expo-apple-authentication`**: the `expo-apple-authentication` plugin plus `ios.usesAppleSignIn: true`. `isAvailableAsync()`. `signInAsync({ requestedScopes, nonce, state })` returns a credential with `identityToken`, `authorizationCode` and `email` (`email` is `null` after the first sign-in). A cancel throws `ERR_REQUEST_CANCELED`. `AppleAuthenticationButton` needs width and height, and must not get `backgroundColor` or `borderRadius`.
- **Supabase Edge Functions**: the default secrets are `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` and `SUPABASE_PUBLISHABLE_KEYS` (JSON keyed by name, `default`), with the legacy `SUPABASE_SERVICE_ROLE_KEY` alongside. The platform's `verify_jwt` check only understands legacy JWT keys, so the docs say to set `verify_jwt = false` and authorize in code. `auth.getClaims(jwt)` checks the token against the JWKS. On projects without asymmetric signing keys it asks the Auth server instead, as `getUser` does.
- **To check during the build** (each one then pinned by a test): the `verifyOtp` error codes for a wrong code and for a used code (task 1). Whether the verify response's `user.identities[*].last_sign_in_at` tells which method signed in this time (task 1; `app_metadata.provider` is only the first method ever used). Which `getClaims` error a valid token for a deleted user gives (task 8). Whether Expo Router also routes `rebloom://auth/callback` while `openAuthSessionAsync` is open (task 26). The `router.dismissTo` / `dismissAll` names in SDK 58 Expo Router (task 15). Whether Supabase revokes Apple tokens when a user is deleted (task 31).

---

## Architecture

```
src/app/                      routes only: thin screens that use src/account/
  settings.tsx                adds <AccountCard/> (only when the backend is configured)
  account/_layout.tsx         Stack (headerShown false); presented as a modal from the root Stack
  account/sign-in.tsx         artboard 18 (signed out)
  account/email.tsx           18a
  account/code.tsx            18b
  account/index.tsx           18c (signed in): sign-out sheet, delete sheet
  auth/callback.tsx           phase 2: Google deep link; UI only on failure
src/account/                  feature code; the only non-route code that imports src/backend/
  input.ts                    normalizeEmail · isEmailShape · cleanCode (pure)
  messages.ts                 BackendError → the spec's plain-words text, per step
  store.ts                    useAccount(): guest | signed_in | expired | unconfigured | loading
  AccountCard.tsx             Settings card, 3 states
  DeleteAccountSheet.tsx      ready / deleting / failed
  useResendTimer.ts           60 s countdown, announced to screen readers
  callbackUrl.ts              phase 2: parseCallbackUrl(url) → { code } | { error } | { none } (pure)
src/backend/
  errors.ts                   + 'invalid_code'
  session.ts                  SessionUser gains `method`
  auth.ts                     sendEmailCode · verifyEmailCode · deleteAccount · (2) signInWithGoogle · exchangeCallbackCode · (3) signInWithApple
  config.ts                   + APPLE_SIGN_IN_ENABLED = false
supabase/
  functions/delete-account/index.ts
  config.toml                 [functions.delete-account] verify_jwt = false
  tests/local/delete-account.test.mjs
```

- **Layers**: route → `src/account/` → `src/backend/auth.ts` → `session.ts` / `supabase.ts`. Screens never call supabase-js. `auth.ts` is the only new file that uses the client, and every sign-in it does goes through `setSessionFromAuth`.
- **Account state without a provider**: `store.ts` is a module-level store read with `useSyncExternalStore`. It starts on the first subscribe: it subscribes to `onSessionChange` first, then calls `getCurrentUser()`, so a refresh rejected during that call still arrives as `session_expired`. Nothing runs at app start, so the root-layout "no request on start" test still holds. `expired` stays until a sign-in. *Deliberate limit*: it's kept in memory, so after a restart an expired account shows as guest. That's harmless, because the user can still sign in. Persist it later if it confuses anyone.
- **Sign-in method shown**: `session.ts` `toUser()` takes `method` from the identity with the latest `last_sign_in_at`, falling back to `app_metadata.provider`. If task 1 shows identities aren't in the session, `auth.ts` records the method it used next to the session instead (decided in task 3).
- **Errors**: `BACKEND_ERRORS` gains `invalid_code` (from `otp_expired`, and any other code task 1 finds), so the closed-set property test covers it. `messages.ts` turns codes into the spec's sentences per step (send, verify, delete, Google). Unknown errors get a generic sentence, never the server's text.
- **Single flight**: every action uses the existing `useSingleFlight`. Code verify has one flight shared by auto-submit at 6 digits and the "Continue" button.
- **Delete account**: the app calls `supabase.functions.invoke('delete-account')`, which sends the session token. Then it calls the foundation's `signOut()`, which already treats `user_not_found` as done and works offline. The function:
  1. Allows only `POST`.
  2. Reads the `Authorization: Bearer` token and runs `getClaims(token)`.
  3. Requires `role === 'authenticated'` and a uuid `sub`, otherwise 401. This refuses publishable or anon tokens.
  4. If the user is already gone, returns 204.
  5. Runs `auth.admin.deleteUser(sub)` with the secret key; `user_not_found` also returns 204. Any other error returns 500 with a generic body.
  6. Never reads the request body.

  Rows go by the foundation's `on delete cascade`, already proven by its pgTAP template test (T4 there).
- **Production config**: never `supabase config push`, because it would copy the local `site_url` (`127.0.0.1`) to production. Sanket changes auth settings in the dashboard, one checklist item at a time in the PR. The function goes out with `supabase functions deploy delete-account` after merge (it reads `verify_jwt` from `config.toml`).

---

## Tasks

Each task is one commit. **Strict TDD**: write the test, watch it fail, then implement. Production stays untouched until the "Production" step of each phase.

### Phase 1 (PR 1): email code, account screens, sign out, delete

**1A: Facts and backend** (sequential: 1 → 2 → 3 → 4 → 5)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 1 | Pin Supabase Auth's answers on the local stack: a wrong code, a reused code, and the identities in the verify response | `supabase/tests/local/auth.test.mjs` | T1 |
| 2 | `invalid_code` in `BACKEND_ERRORS`, mapped from the codes task 1 found | `src/backend/errors.ts`, `__tests__/errors.test.ts` | T2 |
| 3 | `SessionUser.method`; the fake auth server returns identities | `src/backend/session.ts`, `src/testing/fakeAuthServer.ts`, `__tests__/session.test.ts` | T3 |
| 4 | `auth.ts`: `sendEmailCode`, `verifyEmailCode` | `src/backend/auth.ts`, `__tests__/auth.test.ts` | T4 |
| 5 | `auth.ts`: `deleteAccount` | `src/backend/auth.ts`, `__tests__/auth.test.ts` | T5 |

**1B: Edge Function** (parallel with 1A after task 1)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 6 | `config.toml` `[functions.delete-account] verify_jwt = false`; the static config test checks it | `supabase/config.toml`, `supabase/tests/config.test.mjs` | T6 |
| 7 | `delete-account` function | `supabase/functions/delete-account/index.ts`, `supabase/tests/local/delete-account.test.mjs` | T7 |
| 8 | Deleted-user and forged-token cases | same two files | T8 |

**1C: Pure helpers and state** (parallel with 1A and 1B)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 9 | `normalizeEmail`, `isEmailShape`, `cleanCode` | `src/account/input.ts`, `src/account/__tests__/input.test.ts` | T9 |
| 10 | `messages.ts` | `src/account/messages.ts`, `__tests__/messages.test.ts` | T10 |
| 11 | `store.ts` / `useAccount` | `src/account/store.ts`, `__tests__/store.test.ts` | T11 |
| 12 | `useResendTimer` | `src/account/useResendTimer.ts`, `__tests__/useResendTimer.test.ts` | T12 |

**1D: UI** (depends on 1A and 1C; tasks 13–14 first, then 15–19 in order)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 13 | `TextField` (label, error text, 44pt, tokens); `Button` gains `variant: 'secondary' \| 'severe'` | `src/components/TextField.tsx`, `src/components/Button.tsx`, `src/components/__tests__/…` | T13 |
| 14 | Settings account card | `src/account/AccountCard.tsx`, `src/app/settings.tsx`, `src/account/__tests__/AccountCard.test.tsx` | T14 |
| 15 | `account` route group: root `Stack.Screen name="account"` (modal, no header), account layout, Back and close behaviour | `src/app/_layout.tsx`, `src/app/account/_layout.tsx`, `src/__tests__/account-navigation.test.tsx` | T15 |
| 16 | Sign-in screen (phase 1: email only, plus "Not now") | `src/app/account/sign-in.tsx`, `src/__tests__/account-sign-in.test.tsx` | T16 |
| 17 | Email screen | `src/app/account/email.tsx`, `src/__tests__/account-email.test.tsx` | T17 |
| 18 | Code screen | `src/app/account/code.tsx`, `src/__tests__/account-code.test.tsx` | T18 |
| 19 | Account screen + sign-out sheet | `src/app/account/index.tsx`, `src/__tests__/account-screen.test.tsx` | T19 |
| 20 | Delete sheet | `src/account/DeleteAccountSheet.tsx`, `src/app/account/index.tsx`, `src/account/__tests__/DeleteAccountSheet.test.tsx` | T20 |
| 21 | Guards: `ALLOWED_BACKEND_IMPORTERS` lists `account/*` and the account routes plus `settings.tsx`, on purpose; the root layout still makes no request; no hex outside `theme/` | `src/__tests__/guards.test.ts`, `src/__tests__/root-layout.test.tsx` | T21 |

**1E: Store rules, docs, production**

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 22 | Privacy page "App accounts" section (what's stored, processors, delete in app, delete by email without the app) | `landing/src/pages/PrivacyPage.tsx`, `landing/src/pages/PrivacyPage.test.tsx` | T22 |
| 23 | Docs: `supabase/README.md` (function, `functions serve`, secrets, deploy, why `config push` is never used); `app/README.md` Accounts section; device checks added to `.handoff/device-checklist.md` | docs | None (docs). Full green run: app `typecheck`, `lint`, `test`; `node --test "supabase/tests/*.test.mjs"`; `supabase test db`; `node --test "supabase/tests/local/*.test.mjs"` |
| 24 | **Break-test** report (no fixes until Sanket picks), the swarm offered, Sanket reads the diff | report in this plan | — |
| 25 | **Production, after merge, with Sanket**: Supabase custom SMTP with Gmail (D2; the domain, DNS and Resend come before the store release); both templates pasted from `supabase/templates/sign_in_code.html`; `email_sent` limit (D3); "Confirm email" still on; `supabase functions deploy delete-account`; one real sign-in, sign-out and delete from a dev build against production with a `+test` address | dashboard, CLI | Each step ticked in the PR; device checks for email delivery |

### Phase 2 (PR 2): Google (needs a Google Cloud project and a development build)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 26 | `npx expo install expo-web-browser expo-auth-session`; `eas.json` `development` profile; check whether Expo Router also routes the callback while the browser is open | `package.json`, `eas.json` | Spike notes in this plan |
| 27 | `parseCallbackUrl` | `src/account/callbackUrl.ts`, `__tests__/callbackUrl.test.ts` | T23 |
| 28 | `signInWithGoogle` (`signInWithOAuth` with `skipBrowserRedirect`, `openAuthSessionAsync`, `exchangeCodeForSession` through `setSessionFromAuth`); an in-memory "Google sign-in in progress" flag; `exchangeCallbackCode` | `src/backend/auth.ts`, `__tests__/auth.google.test.ts` | T24 |
| 29 | `/auth/callback` route: exchanges only when this phone started the sign-in and the browser call isn't already handling it; otherwise "Sign-in didn't finish". Android Back goes to the sign-in screen | `src/app/auth/callback.tsx`, `src/__tests__/auth-callback.test.tsx` | T25 |
| 30 | Google button on the sign-in screen (Android always; iOS only when `APPLE_SIGN_IN_ENABLED`) | `src/app/account/sign-in.tsx`, `src/backend/config.ts`, `src/__tests__/account-sign-in.test.tsx` | T26 |
| — | Break-test, swarm offer, diff read. **Production**: Google Cloud OAuth client (Web), branding and verification, Supabase Google provider, `rebloom://auth/callback` in the redirect allow list. **Device**: Google in a dev build on the Android phone (iOS waits for phase 3); Google then email code with the same Gmail gives the same user id (if not: stop and report, as the spec says) | — | Device checklist |

### Phase 3 (PR 3): Apple, iOS only. PAUSED (2026-11-07) until the app is built

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 31 | Apple token revocation: check whether Supabase revokes on user delete. If not, the delete flow asks Apple again for an `authorizationCode`, and the function exchanges it with a client secret it signs from the `.p8` key (a function secret, so nothing needs renewing every 6 months) and calls Apple's revoke endpoint | decision recorded here | — |
| 32 | `npx expo install expo-apple-authentication`; plugin plus `ios.usesAppleSignIn` in `app.json`; the guard test checks the plugin | `app.json`, `src/__tests__/guards.test.ts` | T27 |
| 33 | `signInWithApple`: raw nonce (`Crypto.randomUUID()`), SHA-256 to Apple (`Crypto.digestStringAsync`), raw value to `signInWithIdToken`; email scope only; cancel isn't an error | `src/backend/auth.ts`, `__tests__/auth.apple.test.ts` | T28 |
| 34 | Apple button (`AppleAuthenticationButton`, gated by `isAvailableAsync` and iOS); `APPLE_SIGN_IN_ENABLED = true`, which also shows Google on iOS | `src/app/account/sign-in.tsx`, `src/backend/config.ts`, `src/__tests__/account-sign-in.test.tsx` | T26 (iOS cases) |
| 35 | Revocation in `delete-account`, if task 31 says it's needed | `supabase/functions/delete-account/index.ts`, `supabase/tests/local/delete-account.test.mjs` | T29 |
| — | Break-test, swarm offer, diff read. **Production**: App ID with Sign in with Apple; Supabase Apple provider with `com.rebloom.app` only (`host.exp.Exponent` while testing in Expo Go, removed before release); sending domain registered for Apple's private email relay. **Device**: Apple on a real iPhone; code email reaches a Hide My Email address | — | Device checklist |

### Parallel vs sequential

| Parallel group | Tasks | Why |
|---|---|---|
| A | chain 2→3→4→5 · chain 6→7→8 · 9–12 | Three separate folders (backend, `supabase/`, `src/account/`); each chain is sequential inside |
| B | 13, 14 | Components vs card |
| C | 22 | Landing only |

| Sequential | Depends on | Why |
|---|---|---|
| 2, 3 | 1 | Error codes and identity shape come from the local stack |
| 16–20 | 4, 5, 9–13, 15 | Screens use the actions, helpers, store and routes |
| 21 | 14–20 | Lists the real importers |
| 25 | PR 1 merged, D2, D3 | Production |
| Phase 2, Phase 3 | PR 1 merged | Each is its own PR |

---

## Testing Plan

Screens mock `src/account/store` and `src/backend/auth` at the module boundary. Backend tests run the real supabase-js against `fakeAuthServer`. The local stack covers the real Auth server, Mailpit and the edge runtime. Properties use fast-check.

| ID | Test | File | Spec trace |
|---|---|---|---|
| T1 | Local stack: a wrong code gives status X and code Y; a reused code gives Z (values pinned from the first run); a fresh email sign-up's verify response has an `email` identity with `last_sign_in_at` | `local/auth.test.mjs` | Req (errors); edge 3, 4; D1 |
| T2 | Each pinned code → `invalid_code`; the closed-set property still holds with 6 codes | `errors.test.ts` | Edge 3, 4 |
| T3 | `method` is the identity with the latest `last_sign_in_at` (email, google, apple); with no identities → `app_metadata.provider`; unknown provider → `null` | `session.test.ts` | Req (Account shows method); edge 13 |
| T4 | `sendEmailCode` calls `signInWithOtp` once with `shouldCreateUser: true` and the address it was given; 429 → `rate_limited`; a network failure → `offline`; `verifyEmailCode` uses type `email` and goes through `setSessionFromAuth` (listeners get `signed_in`); a wrong code → `invalid_code` with no session change; not configured → `not_configured` | `auth.test.ts` | Happy path 1–2; edges 3, 5, 7 |
| T5 | `deleteAccount`: 204 → `signOut()` runs and the result is ok; 500 → `unknown` and still signed in; network → `offline` and still signed in; 401 → `session_expired`; plant and photo fakes untouched | `auth.test.ts` | Delete; edge 16 |
| T6 | `config.toml` has `[functions.delete-account]` with `verify_jwt = false` | `config.test.mjs` | API |
| T7 | Local: users A and B sign in by code. POST with A's token and `{ "user_id": B }` → 204; A is gone (admin get → not found) and B still exists; the same call again → 204; GET → 405 | `local/delete-account.test.mjs` | Delete; edge 16 |
| T8 | Local: no `Authorization` → 401; the publishable key as bearer → 401; a token with a changed signature → 401; A's still-valid token after A is deleted → 204 | `local/delete-account.test.mjs` | Delete (auth rule) |
| T9 | **Property**: for random strings mixing letters, spaces, capitals and `\p{Cf}`, `normalizeEmail` is idempotent and has no `\p{Cf}`, no outer space and no capitals; a valid address with invisible characters added normalizes to the same address; `isEmailShape` is false above 254 characters or without `x@y.z`. **Property**: `cleanCode` returns digits only, at most 6; "123 456" and "123-456" → "123456" | `input.test.ts` | Edges 1, 2 (review rule) |
| T10 | Every `BackendError` × step has a sentence; **property**: random inputs never return raw server text | `messages.test.ts` | Errors in plain words |
| T11 | Nothing happens until the first subscribe (no `getCurrentUser` call at import); subscribe → `loading` → `guest` or `signed_in`; `signed_out` with `session_expired` → `expired`; a sign-in clears `expired`; `signed_out` (user) → `guest`; not configured → `unconfigured`; the listener is registered before `getCurrentUser` runs | `store.test.ts` | Edge 17, 19 |
| T12 | Fake timers: disabled for 60 s, ready at 60; announces once at start and once when ready (iOS `announceForAccessibility`, Android live region); restarts on each send | `useResendTimer.test.ts` | Resend; review rule (iOS announce) |
| T13 | `TextField` keeps its label and error text in the accessibility label; `Button` severe/secondary use tokens; both are ≥ 44pt | component tests | Accessibility |
| T14 | Card: guest → "Save plants" opens sign-in; signed in → the email, "Signed in with Google", "Account"; expired → "Signed out" and "Sign in"; unconfigured → no card | `AccountCard.test.tsx` | Settings card; edges 17, 19 |
| T15 | Back: code → email → sign-in → Settings; Account → Settings; after a sign-in, Back from Account goes to Settings (not the code screen) | `account-navigation.test.tsx` | Edge 18 |
| T16 | Sign-in shows the copy, "Continue with email", "Not now" (closes); no Google or Apple in phase 1 | `account-sign-in.test.tsx` | Sign-in screen |
| T17 | Email field props (keyboard, autocomplete, no autocorrect or capitalization); "Send code" disabled until the shape passes; an address with spaces, capitals and a zero-width character sends the normalized address; double tap → one call; offline, rate limit and unknown messages; success → code screen with the address | `account-email.test.tsx` | Email; edges 1, 5, 7, 15 |
| T18 | Code field props per platform; a paste of "123 456" verifies once; typing 6 digits verifies once and "Continue" during the flight adds nothing; wrong or expired → the D1 message, field cleared, focus kept; rate limit; offline; resend disabled for 60 s, then sends again and restarts; "Use a different email" goes back; success → Account signed in | `account-code.test.tsx` | Code; edges 2–8, 15 |
| T19 | Account shows the email and method; "Sign out" → sheet → `signOut()` once → Settings with the guest card; plant table and photo fakes counted before and after; double tap → one call | `account-screen.test.tsx` | Sign out; edge 15 |
| T20 | Delete sheet: ready → deleting (busy announced, button disabled, double tap → one call) → Settings with "Your account is deleted."; failure → error on the sheet, still signed in; Back while deleting doesn't close it | `DeleteAccountSheet.test.tsx` | Delete; edges 15, 16 |
| T21 | Only the listed files reach `src/backend/`; rendering the root layout still sends nothing; no hex outside `theme/` | guards, root layout | Release rule (no request on start) |
| T22 | The privacy page has the App accounts section, the processors, the in-app path and the deletion email | `PrivacyPage.test.tsx` | Privacy and store rules |
| T23 | **Property**: for random callback URLs (random query and fragment, missing or repeated `code`, `error` params, other schemes and hosts), `parseCallbackUrl` never throws, returns `code` only for exactly one `code` on `rebloom://auth/callback`, and never reads `access_token` or `refresh_token` | `callbackUrl.test.ts` | Edges 10, 11 |
| T24 | Mocked `openAuthSessionAsync`: `success` with `?code=abc` → `exchangeCodeForSession('abc')` → signed in with method google; `cancel` or `dismiss` → no error and no session; `?error=access_denied` → the Google message; offline exchange → `offline`; double tap → one browser | `auth.google.test.ts` | Google; edges 9, 10, 15 |
| T25 | `/auth/callback` with no sign-in in progress → "Sign-in didn't finish" plus a button; a rejected exchange → the same; with a sign-in in progress whose browser call already resolved → exchanges once; Android Back → sign-in | `auth-callback.test.tsx` | Edge 11 |
| T26 | Android: Google and email, never Apple; iOS with `APPLE_SIGN_IN_ENABLED` false: email only; iOS with it true: Apple only when `isAvailableAsync` is true, and Google | `account-sign-in.test.tsx` | Platform rule; release rule |
| T27 | `app.json` has the Apple plugin and `ios.usesAppleSignIn` | `guards.test.ts` | Phase 3 config |
| T28 | Mocked module: Apple gets the SHA-256 of the nonce and `signInWithIdToken` the raw nonce and token; `ERR_REQUEST_CANCELED` → no error and no session; scopes are email only | `auth.apple.test.ts` | Apple; edge 12 |
| T29 | Local (Apple's endpoints stubbed): deleting an Apple user calls revoke once with the exchanged token; a revoke failure doesn't block the delete (logged) | `local/delete-account.test.mjs` | Open question (revocation) |

Edge cases from the spec: 1 → T9, T17 · 2 → T9, T18 · 3 → T1, T2, T18 · 4 → T1, T18 · 5 → T4, T17, T18 · 6 → T18 · 7 → T4, T17, T18 · 8 → device · 9 → T24 · 10 → T23, T24 · 11 → T23, T25 · 12 → T28 · 13 → T3 + device · 14 → device · 15 → T17–T20, T24 · 16 → T5, T7, T20 · 17 → T11, T14 · 18 → T15, T25 · 19 → T11, T14 · 20 → device.

### Device checklist (added to `.handoff/device-checklist.md` in task 23)
- [ ] A real code email arrives in the inbox (not spam) at Gmail, Outlook and iCloud, and through an Apple relay address (phase 3).
- [ ] Code autofill from the email or notification on iOS and Android.
- [ ] App backgrounded on the code screen: the screen is kept. Killed: start again from email, and the old code still works.
- [ ] 200% text on an iPhone SE: every account screen scrolls, and the main button sits above the keyboard.
- [ ] Phase 2: Google in a dev build on the Android phone; Android Back from the browser sheet; Google then email with the same Gmail gives the same user id.
- [ ] Phase 3: Apple on a real iPhone; an Apple user's relay address receives a code.

---

## Risks

| Risk | Mitigation |
|---|---|
| Wrong and expired codes give the same error, so the spec's two messages can't both be true | T1 pins it; D1 picks the wording |
| `app_metadata.provider` shows the first method, not this one ("Signed in with email" after a Google sign-in) | `method` from the latest identity (T3); a fallback is decided in task 3 if identities are missing |
| A Settings card that starts the backend at app start breaks the foundation's "no request on start" guarantee | The store starts on first subscribe (T11), and the root-layout test still runs (T21) |
| `delete-account` deletes the wrong user, or anyone can call it | `sub` comes only from the verified token; the body is never read; role check; T7 and T8 |
| `supabase config push` overwrites production `site_url` with the local address | Never used; dashboard checklist instead (README, task 23) |
| Expo Router handles `rebloom://auth/callback` at the same time as `openAuthSessionAsync`, so the code is exchanged twice (the second fails, and the user sees an error after a good sign-in) | Task 26 spike; the in-progress flag lets only one path exchange (T25) |
| The built-in email limit hides delivery problems until launch | Custom SMTP in phase 1's production step; device delivery checks |
| Apple guideline on token revocation | Task 31 decides before phase 3 ships |

---

## Gate 2

**Architecture**
- [x] Follows existing patterns: routes in `src/app/`, feature code outside it (`src/account/` like `src/scan/`), fakes in `src/testing/`, tests in `__tests__`, `@/` alias, `useSingleFlight`, `BottomSheet`, tokens only
- [x] Each layer only calls the one below it: route → `src/account/` → `src/backend/auth.ts` → `session.ts` / `supabase.ts`; the backend import guard lists the allowed importers by name
- [x] Production changes only after each PR is merged, step by step with Sanket; no `config push`

**Task breakdown**
- [x] All files to change are listed
- [x] All new files are listed with their locations
- [x] Each task is ≤ 3 files and one commit (task 13 touches two components and their tests)
- [x] Dependencies are marked; parallel groups listed
- [x] Outside dependencies (domain, Google Cloud, Apple account) only block their production steps, not the build

**Testing**
- [x] Data layer: no new tables; row cleanup is covered by the foundation's cascade test; the function is tested on the local stack (T7, T8)
- [x] Business logic: T2–T5, T9–T12, T23, T24, T28 (properties in T9, T10, T23)
- [x] Integration: T1, T7, T8 against the local stack; T21 for app start
- [x] UI: T13–T20, T25, T26
- [x] Every spec edge case is traced; device-only checks are in the checklist
- [x] Deviations from the spec stated: D1 (maybe one message for wrong and expired codes); the expired state is in memory only; the cascade test isn't repeated (the foundation's covers it)

**Result: PASSED**
