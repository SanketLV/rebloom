# Spec: Accounts (email code, Google, Apple)

**Created**: 2026-11-03
**Status**: draft
**Author**: Sanket
**Epic**: Cloud backup of plants (step 2 of 3: foundation → accounts → backup)
**Risk**: high (Supabase auth, a user locked out of their account, account deletion, a server function holding the secret key)

**Sources**: Supabase docs: Passwordless email sign-in (OTP), Email Templates, Send emails with custom SMTP, Sign in with Google, Sign in with Apple · Expo SDK 58 docs from the Expo repo at `expo@58.0.0`: Authentication guide, `expo-web-browser` (`openAuthSessionAsync`), `expo-auth-session` redirect URIs, Using Supabase · `.planning/specs/supabase-foundation.md` (the session module this spec uses) · Design canvas "Rebloom App Screens", artboard 16 Settings

---

## Problem

Backup is only worth having if it survives a lost or replaced phone, and that needs an account the user can get back into on another phone. The foundation spec gives the app a session module but no way to sign in. People expect the usual options: an email code (no password to forget), Google, and on iPhone, Apple. The App Store and Google Play also have rules that come with accounts: in-app account deletion, a deletion request link on the web, Sign in with Apple whenever Google sign-in is offered on iOS, and a privacy policy that covers the app.

## Goal

From Settings → Account, a user can sign in with a 6-digit email code, with Google (browser sign-in), or on iPhone with Apple. They stay signed in across restarts, can sign out, and can delete their account from inside the app. Signing in the same way on another phone reaches the same account. Scanning and My Plants keep working with no account and offline, exactly as today. `typecheck`, `lint`, `test` and the backend tests pass.

## Decisions

- **No anonymous accounts** (2026-11-03): see the foundation spec.
- **Google uses browser sign-in** (2026-11-03): Supabase's `signInWithOAuth` in the system browser sheet (`expo-web-browser` `openAuthSessionAsync`), with PKCE. Free and the same on iOS and Android. The browser sheet shows the Supabase address; Google's branding verification makes the consent screen say "Rebloom". The native Google library needs a paid version to work with Supabase, so it isn't used.
- **Apple is iOS-only and native** (`expo-apple-authentication` + `signInWithIdToken`). Apple on Android would need the web flow and a secret key renewed every 6 months; not worth it now.
- **Built in three phases** in this one spec, each its own PR, because each needs an outside account:

  | Phase | What | Needs | Expo Go? |
  |---|---|---|---|
  | **1** | Email code, Account screen, sign out, delete account, custom SMTP, privacy page | An email service and a sending domain | Yes |
  | **2** | Google | A Google Cloud project, and a development build | No (Expo says OAuth redirects can't be tested in Expo Go) |
  | **3** | Apple (iOS) | An Apple Developer account, and a development build | Testing only (as Expo Go's app ID) |

- **Release rule**: accounts don't ship in a store build until backup does (signing in with nothing to back up is pointless). On iOS, the Google button stays hidden until Apple is done (App Store rule: an app that offers Google sign-in must also offer a privacy-focused option such as Apple).

## User Stories

- As a **plant owner**, I want to sign in with my email and a code, so I don't need a new password.
- As a **plant owner**, I want to sign in with Google or Apple in one tap, so getting set up is quick.
- As a **plant owner who changes phones**, I want to sign in the same way on the new phone and be back in my account, so my backups follow me.
- As a **plant owner**, I want to sign out or delete my account myself, so I'm in control of my data, and I want to know that plants on my phone stay.
- As a **plant owner who doesn't want an account**, I want scanning and My Plants to keep working without one.

## Requirements

### Must-have

**Phase 1: email code, account screen, sign out, delete**

*Email code sign-in*
- Email screen: one email field (`keyboardType="email-address"`, `autoComplete="email"`, `textContentType="emailAddress"`, no autocorrect or auto-capitalize), "Send code" button, and the line "We'll email you a 6-digit code. No password needed."
- The email is normalized before checking or sending (review rule): strip invisible characters (`\p{Cf}`), trim, lowercase. Then a shape check (`x@y.z`, at most 254 characters). "Send code" is disabled until it passes.
- "Send code" → `signInWithOtp({ email, options: { shouldCreateUser: true } })`. Signing in and creating an account are the same step, and the screen never says whether the address already has an account.
- Code screen: "Enter the code we sent to <email>", a 6-digit field (`keyboardType="number-pad"`, `textContentType="oneTimeCode"` on iOS, `autoComplete="one-time-code"` on Android, so the code can be filled from the email or a notification). Paste is cleaned to digits only ("123 456", "123-456" work). At 6 digits it verifies on its own: `verifyOtp({ email, token, type: 'email' })` → the foundation's `setSessionFromAuth`. A "Continue" button (enabled at 6 digits) does the same, for screen-reader users and when autofill doesn't trigger a change; both go through one single-flight call. "Can't find it? Check your spam folder." under the button.
- "Send a new code" is disabled for 60 seconds after each send, with the countdown shown and announced to screen readers. "Use a different email" goes back.
- Errors in plain words: wrong code ("That code isn't right. Check the email or send a new one."), expired code, too many tries (`rate_limited`), offline. The code field keeps focus and is cleared on a wrong code.
- Code lifetime: 10 minutes (`otp_expiry = 600`).

*Email delivery*
- Custom SMTP on the production project (Supabase's built-in email only delivers to the project's team members). Service: Resend, unless Sanket picks another from Supabase's list. Sending address `no-reply@<auth subdomain>` with SPF, DKIM and DMARC set up for that domain.
- The "Magic link" and "Confirm signup" templates both contain the code (`{{ .Token }}`) and no link: short subject ("Your Rebloom code: {{ .Token }}"), plain body, no marketing, no images, as the Supabase deliverability guide advises. A link isn't needed, and email scanners that open links would use it up.
- The project's email rate limit is raised from the default 30 per hour to a number that fits the email service's plan (set in the plan; see Open Questions).
- The local stack uses its own mail catcher; nothing sends real email in development.

*Account screens* (artboards 16, 18, 18a–c in the design canvas)
- Settings stays a placeholder except for the account card at the top (artboard 16), which only appears when the backend is configured (foundation `config.ts`). Three states: guest ("Guest · Plants are saved on this phone only", button "Save plants" → Sign in), signed in (the email, "Signed in with Google", button "Account" → Account), signed out after `session_expired` ("Signed out · Sign in again to keep your account", button "Sign in"). Buttons 44pt tall.
- Sign in (`/account/sign-in`, artboard 18): close (X), "Keep your plants safe", "Save your plants, photos and treatment history, so nothing is lost if you change phones.", then Apple (iOS, phase 3), Google (phase 2), "Continue with email" (phase 1), "Not now", and "Scanning works without an account. We never post anything or sell your data." All sign-in buttons the same size; in the app the Apple button is Apple's own `AppleAuthenticationButton`.
- Account (`/account`, artboard 18c, signed in only): the email, "Signed in with Google / Apple / email", a "Backup" row (filled in by the backup spec; hidden until then), "Sign out", "Delete account" (in `severe`), and "Signing out never removes plants from this phone." 
- "Sign out": a confirm sheet ("Sign out? Your plants stay on this phone.") → foundation `signOut()`. Never touches plants, scans or photos on the phone.
- When the foundation reports `session_expired`, the Settings card shows its signed-out state. No other screen changes.

*Delete account*
- "Delete account" → a sheet: "Delete your Rebloom account? This can't be undone. Your plants stay on this phone." with "Delete account" (`severe` button) and "Cancel". The busy state is announced to screen readers and the button can't be pressed twice.
- Calls the Edge Function `delete-account`. The function reads the caller from their own token (`Authorization` header), ignores any user id in the body, and deletes that user with the admin API (the secret key lives only in the function's environment). The foundation's `on delete cascade` removes their rows. Then the app signs out locally and shows "Your account is deleted."
- Deleting an already-deleted user counts as success (the first call may have worked while the reply was lost).
- **The backup spec must extend this function to remove the user's photo files** (storage objects aren't removed by the cascade) before its first upload.

*Privacy and store rules* (landing page)
- `landing/` privacy page gets an "App accounts" section: what's stored (email, sign-in method, the dates the account was made and last used), who processes it (Supabase; the email service; Google or Apple if used), how to delete it in the app, and a way to request deletion without the app (an email address). Google Play needs that web deletion route, and the App Store needs the privacy policy URL.
- The scan copy ("Scans run on your phone · works offline") stays true: nothing about scans leaves the phone in this spec.

**Phase 2: Google**
- Google Cloud: an OAuth client of type "Web application" whose redirect URI is `https://vhxcgmupopeochwvmwcv.supabase.co/auth/v1/callback`; scopes `openid`, email, profile; branding with the app name, logo, the landing page as home page, and the privacy page; submitted for brand verification (a few business days) and set to "In production".
- Supabase: Google provider on with that client's ID and secret; `rebloom://auth/callback` added to the redirect allow list. The Site URL stays the landing page.
- Flow: `signInWithOAuth({ provider: 'google', options: { redirectTo: 'rebloom://auth/callback', skipBrowserRedirect: true } })` → `WebBrowser.openAuthSessionAsync(url, redirectTo)` → on success read `code` (or `error`) from the returned URL → `exchangeCodeForSession(code)` → `setSessionFromAuth`. PKCE (set in the foundation client), so the redirect URL carries a one-time code and never tokens.
- Cancel or dismiss → back on the Account screen, no error.
- A route `src/app/auth/callback.tsx` handles the same link when it arrives as a deep link instead (Android can reopen the app that way, or the app was killed while the browser was open): it exchanges the code if this phone started that sign-in, otherwise it shows "Sign-in didn't finish" with a button back to Account. Never a blank screen; Android Back goes to Account.
- `expo-web-browser` and `expo-auth-session` installed with `npx expo install`; APIs checked against the SDK 58 docs.
- EAS: `eas.json` with a `development` profile; a development build for the Android phone (and the iOS simulator) is the test target from here on.

**Phase 3: Apple (iOS only)**
- Apple Developer: App ID `com.rebloom.app` with Sign in with Apple; `ios.usesAppleSignIn: true` and the `expo-apple-authentication` plugin in `app.json` (checked against the SDK 58 docs).
- Supabase: Apple provider on, Client IDs `com.rebloom.app` (and `host.exp.Exponent` only while testing in Expo Go; removed before release).
- Flow: `AppleAuthentication.isAvailableAsync()` gates the button. A random nonce (`expo-crypto`); Apple gets its SHA-256 hash, `signInWithIdToken({ provider: 'apple', token: identityToken, nonce })` gets the raw value. Only the email scope is asked for; the name isn't needed.
- Cancel (`ERR_REQUEST_CANCELED`) → back on Account, no error.
- Apple's private relay: the sending address is registered in Apple's "Sign in with Apple for Email Communication", so code emails reach "Hide My Email" addresses too (this is how an Apple user who moves to Android gets in: email code to the address shown in Settings).
- On iOS, the Google button appears only once this phase ships (release rule). One constant in `src/backend/config.ts`, `APPLE_SIGN_IN_ENABLED`, is `false` until phase 3 and controls both the Apple button and Google on iOS.

### Nice-to-have
- Haptic on successful sign-in.
- Open the user's mail app from the code screen.

### Out of scope
- Cloud backup (the next spec), and anything that needs it: "restore on a new phone", backup status.
- Apple on Android, the paid native Google library, Google One Tap.
- Passwords, phone/SMS codes, magic links, two-factor.
- Linking or unlinking sign-in methods by hand, changing the account email.
- CAPTCHA (needs an in-app web view on mobile; revisit if bots show up).
- The rest of the Settings screen (artboard 16).
- Custom Supabase domain (paid; would hide the Supabase address in the Google browser sheet).

## Data Model

No new tables. Accounts live in Supabase's `auth.users` and `auth.identities`. Nothing about accounts is stored in the app's SQLite database; the session is stored by the foundation's session module.

## API Changes

| What | Who calls it | Notes |
|---|---|---|
| Supabase Auth: `signInWithOtp`, `verifyOtp`, `signInWithOAuth` + `exchangeCodeForSession`, `signInWithIdToken` | The app | Built-in endpoints; no custom code |
| Edge Function `POST /functions/v1/delete-account` | The app, signed in | Body ignored. 204 on success (also when the user is already gone), 401 without a valid token. Holds the secret key in its environment. Rate-limited by Supabase's function limits. |

Production auth settings (dashboard, mirrored in `supabase/config.toml` where the CLI supports it):

| Setting | Value |
|---|---|
| Anonymous sign-ins | off |
| Email provider | on, sign-in by code, `otp_expiry` 600s |
| Phone provider | off |
| Custom SMTP | on (phase 1) |
| Email rate limit | raised from 30/hour (number in the plan) |
| Google provider | on (phase 2) |
| Apple provider | on (phase 3), native client IDs only |
| Redirect allow list | `rebloom://auth/callback` (phase 2) |
| Site URL | the landing page (unchanged) |

## UI Changes

| Route / element | Type | Design reference |
|---|---|---|
| Settings account card | Card on the placeholder Settings screen (guest / signed in / signed out) | 16 Settings (`account` tweak) |
| `/account/sign-in` | Stack screen | 18 Sign in |
| `/account/email` | Stack screen | 18a Sign in · email |
| `/account/code` | Stack screen (wrong / expired / too many tries / resend states) | 18b Sign in · code (`status`, `resendReady` tweaks) |
| `/account` | Stack screen, signed in | 18c Account (`method` tweak) |
| Sign-out sheet | Bottom sheet on `/account` (existing `BottomSheet`) | Sheet · Sign out |
| Delete sheet | Bottom sheet on `/account` (ready / deleting / failed) | Sheet · Delete account (`state` tweak) |
| `/auth/callback` | Route for the Google deep link; UI only when it fails | State · Sign-in didn't finish |

All colors, type, radius and spacing come from `tokens.ts`. Touch targets ≥ 44×44, every interactive element has an accessibility label and role, busy states and countdowns are announced to screen readers, and the screens scroll at 200% text on an iPhone SE.

## Edge Cases

1. **Messy email input** (spaces, capitals, an invisible character pasted from a chat app): normalized before sending; "Send code" stays disabled until the result has a valid shape.
2. **Pasted code with spaces or dashes**, or filled in by the keyboard: cleaned to 6 digits and verified once.
3. **Wrong code, then the right one**: the wrong one shows the error and clears; the right one signs in.
4. **Code expired or already used**: "That code has expired. Send a new one." with the resend button (if its 60 seconds are up).
5. **Too many sends or tries** (Supabase limits): `rate_limited` → "Too many tries. Wait a minute and try again."
6. **Code email never arrives** (spam folder, typo): the code screen shows the address it sent to, "Use a different email", and "Send a new code" after 60 seconds.
7. **Offline** on any sign-in step: "You're offline. Connect and try again." Nothing half-done is stored.
8. **App backgrounded or killed on the code screen**: coming back to the app keeps the screen; after a kill the user starts again from the email screen, and the old code still works until it expires.
9. **Google cancelled or browser closed**: back on Account, no error, no session.
10. **Google returns an error** (`error=access_denied`, unverified app warning dismissed): "Google sign-in didn't finish. Try again or use email."
11. **Google deep link with no sign-in in progress**, or a stale or forged `code` (any app can open `rebloom://auth/callback`): the exchange fails safely with PKCE (no matching verifier), "Sign-in didn't finish", nothing stored.
12. **Apple cancelled**: back on Account, no error.
13. **Same person, two methods**: Google and email code with the same address reach the same account (Supabase links identities with the same verified email). Apple with "Hide My Email" gives a different address and so a different account; the signed-in screen shows the email and method so the user can tell.
14. **iPhone (Apple) user moves to Android**: no Apple button there; they sign in with an email code to the address the Account screen showed (relay addresses forward because the sending domain is registered).
15. **Double tap** on "Send code", Google, Apple, "Sign out", "Delete account": one request each (single-flight, button disabled while busy).
16. **Delete fails** (offline, 5xx): error on the sheet, still signed in, nothing deleted. **Delete succeeded but the reply was lost**: a retry gets 204 and the app finishes signing out.
17. **Account deleted on another phone**: this phone's next refresh is rejected → foundation `session_expired` → the Settings card shows "Signed out". Plants on the phone stay.
18. **Android Back** on the code screen → email screen; on email → Account; on Account → Settings. Never stuck in the browser sheet.
19. **Backend not configured** (no env in a local build): no account card on Settings, so no dead end.
20. **Small screens and large text**: every account screen scrolls, the main button stays reachable above the keyboard.

## Testing Criteria

Written test-first. Screens with the foundation's session module and the Supabase client mocked at the module boundary; email code, Google code exchange and the delete function against the local stack (`supabase start`, `supabase functions serve`), with email read from the local mail catcher; property tests with `fast-check`.

### Happy path
- [ ] Email: a valid address → "Send code" calls `signInWithOtp` once with the normalized address and `shouldCreateUser: true` → code screen.
- [ ] Code: 6 digits typed → `verifyOtp` once with type `email` → session set → back on Account, signed-in view with the email and "Signed in with email".
- [ ] Local stack: send a code, read it from the mail catcher, verify, and the token works for an RLS-protected request.
- [ ] Settings card: guest → "Save plants"; signed in → the email and "Account"; after `session_expired` → "Signed out" and "Sign in".
- [ ] Sign out → confirm → signed-out view; plants table and photo files untouched (counted before and after).
- [ ] Delete → confirm → the function is called with the user's token → signed out with "Your account is deleted." Local stack: the user and their rows (test-only table) are gone; another user's rows are not.
- [ ] Google (mocked browser): `openAuthSessionAsync` returns `rebloom://auth/callback?code=abc` → `exchangeCodeForSession('abc')` → signed in with "Signed in with Google".
- [ ] Apple (mocked module, iOS): `signInAsync` gets the SHA-256 of the nonce; `signInWithIdToken` gets the raw nonce and the identity token → signed in.
- [ ] Platform: Android shows Google and email, never Apple; iOS shows Apple only when `isAvailableAsync` is true; on iOS Google is hidden while the Apple phase flag is off.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and the backend tests pass.

### Edge cases
- [ ] Property test: for random strings mixing letters, spaces, capitals and invisible characters, normalization is idempotent, has no `\p{Cf}`, no leading or trailing space, no capitals; a valid address with invisible characters added normalizes to the same address.
- [ ] Property test: for random pasted strings, the code cleaner returns digits only, at most 6, and verify runs only at exactly 6.
- [ ] Property test: for random callback URLs (random query and fragment, missing or repeated `code`, `error` params, other schemes), the parser never throws, never passes anything but a single `code` to the exchange, and never reads tokens from the URL.
- [ ] Wrong code → error shown, field cleared, still on the code screen; expired → the expired message.
- [ ] "Send a new code" disabled for 60s (fake timers), countdown has an accessibility live region.
- [ ] 429 from send or verify → the rate-limit message.
- [ ] Offline (fetch rejects) on send, verify, Google exchange, delete → the offline message, no session change.
- [ ] Google cancel (`type: 'cancel'` / `'dismiss'`) → Account, no error text.
- [ ] `/auth/callback` with no sign-in in progress, or a code the exchange rejects → "Sign-in didn't finish" + button to Account; Android Back → Account.
- [ ] Apple `ERR_REQUEST_CANCELED` → Account, no error text.
- [ ] Double tap on each action → one call.
- [ ] Local stack, delete function: no token → 401; a token for user A with user B's id in the body → only A is deleted; called twice → 204 both times.
- [ ] Local stack: Google-style and email sign-in with the same verified email → the same user id (identity linking works as the spec assumes; if not, stop and report).
- [ ] Delete fails (mocked 500) → error on the sheet, still signed in.
- [ ] `session_expired` from the foundation → the signed-out state of the Settings card.
- [ ] Backend not configured → no account card on Settings.
- [ ] No hex colors outside `tokens.ts` (existing guard test).
- [ ] Device checks (added to the `.handoff/` device checklist): real email arrives (inbox, not spam) at Gmail, Outlook and iCloud, and through an Apple relay address; code autofill on iOS and Android; Google in a development build on the Android phone and the iOS simulator; Apple on a real iPhone; Android Back from the browser sheet; 200% text on iPhone SE.

### After the build (break-test protocol)
- Per phase: break-test report before fixes, the adversarial swarm offered (high risk), Sanket reads the diff before merge. Production settings change only after the phase's PR is approved, and each change is checked off in the PR.

## Dependencies

- `.planning/specs/supabase-foundation.md` merged (session module, local stack, migration history fixed).
- Phase 1: a domain for sending email (or a subdomain of the landing page's domain) with DNS access, and an email service account (Resend suggested).
- Phase 2: a Google Cloud project; an Expo account for EAS development builds.
- Phase 3: an Apple Developer account ($99/year).
- npm (via `npx expo install`): `expo-web-browser`, `expo-auth-session` (phase 2), `expo-apple-authentication` (phase 3). Already installed: `expo-crypto`, `expo-linking`, `fast-check`.
- Every Expo API used is checked against the SDK 58 docs before use (`docs.expo.dev` is blocked in the cloud session; the Expo repo at `expo@58.0.0` was used).

## Open Questions

- **Do you have an Apple Developer account?** Phase 3 can't start without one, and on iOS Google waits for Apple.
- **Which domain sends the emails?** Needed for phase 1 (SPF/DKIM/DMARC). The landing page's domain works if you own it; a subdomain like `auth.<domain>` keeps sign-in mail separate from any future newsletter.
- **Email limits**: the email service's free plan has a daily cap. Pick the plan and the Supabase hourly limit together in the plan, sized for launch.
- **Apple token revocation on delete**: Apple asks apps that offer Sign in with Apple to revoke the user's Apple tokens when they delete their account. Check in the plan whether Supabase does this; if not, `delete-account` calls Apple's revoke endpoint, which needs an Apple signing key kept as a function secret.
- ~~Designs?~~ **Decided 2026-11-03:** draw the account screens (Account signed out / signed in, email, code, sign-out and delete sheets, "Sign-in didn't finish") in the design canvas before building phase 1. Done the same day: artboards 18 (updated), 18a, 18b, 18c, 16 (account card states) and three sheets/states, listed in UI Changes.

---

## Gate 1

**Completeness**
- [x] Problem is clearly stated
- [x] Goal is specific and measurable (three sign-in methods, sign out, delete, same account on another phone, app works without an account)
- [x] At least one user story (5)
- [x] Requirements split into must-have (by phase), nice-to-have, out of scope
- [x] Out of scope section exists

**Data Model**
- [x] No new tables; accounts in `auth.users`, rows removed by the foundation's cascade
- [x] Photo-file cleanup handed to the backup spec as a must-do before its first upload

**API Design**
- [x] Built-in Supabase Auth endpoints listed; one Edge Function with its responses and auth rule
- [x] Production auth settings listed

**Quality**
- [x] Edge cases listed (20)
- [x] Testing criteria for happy path
- [x] Testing criteria for edge cases, including property tests (high risk)
- [x] Dependencies listed
- [x] Risk rated: high

**Result: PASSED**
