# Spec: Onboarding

**Created**: 2026-11-03
**Status**: draft
**Risk**: medium
**Author**: Sanket
**Epic**: none

**Sources**: Notion "AI Plant Doctor App" → Screens & User Flow · Design canvas "Rebloom App Screens" (https://claude.ai/artifact/1ief2yordgFEYCVaYV41qW), artboard 02 Welcome for the first screen's copy · Photos and their intent in `brand/source/flux_hero.py` (`ob-*` prompts) · Landing copy in `landing/src/components/HowItWorks.tsx`

**Risk reasoning**: a bug here can block the whole app, but nothing is lost: no user data is touched and there is no migration in `rebloom.db`. The requirements below make sure a storage failure can't trap anyone in the flow. If the plan ends up needing a `rebloom.db` migration, this goes to high.

**Change from the earlier plan**: Notion said Welcome is one screen with "No multi-slide tour." The 4 photos in `c3e2f94` (2026-11-01) came later, and on 2026-11-03 the user chose 4 screens with Skip on each. Notion is updated to match. Artboard 02 is still the one-screen version; it isn't redrawn.

---

## Problem

A first-time user opens Rebloom and lands on the Today tab, which is a placeholder. Nothing says what the app does or that the first diagnosis is free, and the path to a first scan is one unexplained button. The 4 onboarding photos in `app/assets/onboarding/` add 135 KB to the app, but no code uses them.

## Goal

On first launch, a user sees 4 full-bleed photo screens and reaches their first scan in at most 4 taps, or leaves for Today in 1 tap from any screen. The flow never appears again once they finish or skip it. `typecheck`, `lint` and `test` all pass.

## User Stories

- As a **new plant owner with a sick plant**, I want to skip straight past any intro, so I can scan the plant now.
- As a **new user who is unsure what the app does**, I want a short explanation of scan, treatment and the day-7 check-in, so I know what I'm getting and that the diagnosis is free.
- As a **returning user**, I want the app to open on Today every time, so I never repeat the intro.

## Requirements

### Must-have

**Screens**, in this order, with this draft copy:

| # | Photo | Title | Body |
|---|---|---|---|
| 1 | `welcome.webp` | Find out what's wrong with your plant | Snap a photo for a free diagnosis. No account, no card. |
| 2 | `scan.webp` | One leaf, one photo | Photograph the leaf that worries you, close up, in good light. A few quick questions narrow it down. |
| 3 | `reminders.webp` | A check-in on day 7 | Start a treatment and we'll remind you to take a new photo, so you can see if it's working. |
| 4 | `ready.webp` | Let's look at your plant | Start with the one that worries you most. |

**Actions**
- Screens 1–3: "Next" (primary) and "Skip" (text button under it, at least 44 tall).
- Screen 4: "Scan a plant" (primary) and "Look around first" (text button). No Skip, since "Look around first" does the same thing.
- Swiping horizontally moves between screens. "Next" does the same for anyone who can't swipe.
- Skip and "Look around first" mark onboarding seen and go to Today. "Scan a plant" marks it seen and opens `/scan`; closing the scan returns to Today.
- No permission is asked anywhere in this flow. Notion: permissions are "each asked when first needed."

**Routing**
- One route, `src/app/onboarding.tsx`. Non-route code goes in `src/onboarding/`.
- The root `Stack` gates with `Stack.Protected` (checked against the SDK 58 docs): `onboarding` when not seen; `(tabs)`, `scan` and `settings` when seen. When the guard flips, onboarding drops out of history, so Back can't return to it.

**Seen flag**
- Key `onboarding_seen` in `expo-sqlite/kv-store`, which ships with the installed `expo-sqlite`. Its default store is a separate file, `ExpoSQLiteStorage`. No new package and no `rebloom.db` migration.
- Read synchronously with `getItemSync` before the first render, so neither the intro nor Today flashes by mistake.

**Look**
- Layout, layers, tokens and states are in `.planning/design/screens/onboarding.md`, which wins over this section if they differ.
- Photo fills the screen (`Image` from `react-native`, `resizeMode="cover"`), moved up per photo so the subject clears the text. It is decorative, so it's hidden from screen readers.
- Text sits on a `photoScrim` panel (new token) anchored to its content, faded in with `react-native-svg` (already installed). Title is `type.title`, body is `type.body`, both in `cameraColors.text`. No new hex values outside `src/theme/tokens.ts`.
- The existing `Button` (`primary` fill) and `TextButton` (`primary` text) are dark green and would disappear on these dark photos. Both get an on-dark variant, using tokens only.
- 4 position dots, hidden from screen readers.
- `StatusBar` is light on this route only.

**Accessibility**
- Each screen change announces "Step 2 of 4" plus the title with `AccessibilityInfo.announceForAccessibility`, the same way `scan/analyzing.tsx` does (`review.md` §6).
- Every action has an `accessibilityLabel` and `accessibilityRole`.
- With reduce motion on, "Next" jumps to the screen without the scroll animation.

**Android Back**: on screens 2–4, Back goes to the previous screen. On screen 1 it exits the app (the default).

### Nice-to-have
- Slow parallax or fade on the photos while swiping. Skip it if it needs Reanimated, which isn't installed.

### Out of scope (each gets its own spec)
- Notifications and the real day-7 reminder (see Open Questions)
- Artboard 03 "Your setup" and any stored setup answers
- Artboard 02's "I already have an account" and any sign-in
- Artboard 01 Splash redesign
- Analytics on where people drop off
- A "replay intro" option in Settings
- Showing the flow differently to people who already have plants: the app isn't released, so there are no existing users to protect
- Redrawing artboard 02 on the canvas

## Data Model

No tables and no migration. One local key:

| Store | Key | Value | Missing means |
|---|---|---|---|
| `expo-sqlite/kv-store` | `onboarding_seen` | `"1"` | Show onboarding |

## API Changes

None.

## UI Changes

| Route | Type | Design reference |
|---|---|---|
| `/onboarding` | New root screen, no header | Artboard 02 for screen 1's copy; layout is new (full-bleed photo, as on the landing hero) |
| `Button`, `TextButton` | On-dark variant | New, tokens only |

States: photos are bundled, so there is no loading or empty state. If a photo fails to decode, the screen falls back to the `cameraColors.ground` background with the text still readable.

## Edge Cases

1. **Storage read throws at launch.** Treat as seen and open Today. Reaching the app matters more than the intro.
2. **Storage write throws on finish or Skip.** The in-memory flag still flips and the user enters the app. The flow may show again next launch, which is harmless.
3. **App killed mid-flow.** Nothing was saved, so it restarts at screen 1 next launch.
4. **Double tap** on Skip, "Scan a plant" or "Look around first": exactly one navigation.
5. **Rapid taps on "Next", or tapping during a swipe.** The index stays within 0–3 and never skips or lands between screens. A fast second tap from screen 3 must not hit "Scan a plant", which takes the same spot.
6. **Deep links.** `rebloom://scan` before onboarding is done lands on onboarding; `rebloom://onboarding` after it's done lands on Today. Neither crashes.
7. **Small screen and large text.** On iPhone SE (375×667) at 200% text, nothing is clipped and the actions stay reachable.
8. **Bright photo areas.** `scan.webp` has a bright yellow leaf down to about 85% of its height, and `welcome.webp`'s seedling sits mid-screen. Text must hold 4.5:1 against the brightest pixel behind it.
9. **Width changes** on a foldable or split screen. The current screen stays aligned and doesn't rest between two pages. Orientation is locked to portrait in `app.json`.
10. **Android Back during a swipe or on the last screen** goes to the previous screen and doesn't leave the flow or exit early.

## Testing Criteria

### Happy path
- [ ] With no flag stored, the app opens on `/onboarding` screen 1 and Today isn't reachable.
- [ ] "Next" walks through screens 1–4 in order, with the right title on each.
- [ ] Skip on each of screens 1–3 stores the flag and lands on Today.
- [ ] "Look around first" stores the flag and lands on Today.
- [ ] "Scan a plant" stores the flag and opens `/scan`; closing it lands on Today.
- [ ] With the flag stored, the app opens on Today and `/onboarding` isn't reachable.
- [ ] Each screen change announces its step and title.
- [ ] No permission request fires anywhere in the flow.
- [ ] All 4 photos are referenced (a guard test fails if a file in `assets/onboarding/` goes unused).
- [ ] `npm run typecheck`, `npm run lint` and `npm test` all pass.

### Edge cases
- [ ] Read mocked to throw: the app opens on Today.
- [ ] Write mocked to throw: the user still reaches Today, with no crash.
- [ ] Double tap on each exit action navigates once.
- [ ] Rapid "Next" presses keep the index within 0–3.
- [ ] Back on screen 3 goes to screen 2; Back on screen 1 isn't intercepted.
- [ ] After finishing, Back from Today doesn't return to onboarding.
- [ ] Deep links in both directions land as described in edge case 6.
- [ ] Reduce motion on: "Next" calls `scrollTo` with `animated: false`.
- [ ] Existing hex-color guard test still passes.

### Device checklist (add to `.handoff/`, not blocking review)
- [ ] Photos render on Android and iOS, with no flash on launch.
- [ ] Contrast check on all 4 screens, `scan.webp` first.
- [ ] iPhone SE size at 200% text; TalkBack and VoiceOver through the whole flow.
- [ ] Swipe and "Next" feel right; Android gesture Back.

Process per `review.md` for medium risk: typecheck, lint, unit tests, one review pass, integration tests and a break-test report.

## Dependencies

- Installed already: `expo-router` (`Stack.Protected`), `expo-sqlite` (`kv-store`), `react-native-svg`, `expo-status-bar`
- New packages: none
- `src/testing/nativeMocks` needs a `kv-store` mock, since `jest.setup.ts` mocks only `expo-sqlite` today
- Assets: `app/assets/onboarding/*.webp`, already in `develop`

## Open Questions

- **Release blocker: screen 3 describes a feature that doesn't exist yet.** `expo-notifications` isn't installed, so no day-7 reminder fires. The draft copy is fine for internal builds, but this must not reach store users until the reminder ships, or screen 3's copy has to change.
- **Copy is a draft.** Only screen 1 comes from a design source. Screens 2–4 are adapted from the landing page and the user hasn't reviewed them.

---

## Gate 1

**Completeness**
- [x] Problem is clearly stated
- [x] Goal is specific and measurable (first scan in at most 4 taps, out in 1 tap, never shown twice)
- [x] At least one user story
- [x] Requirements split into must-have, nice-to-have, out of scope
- [x] Out of scope section exists

**Data Model**: no tables. One local key, documented above.

**API**: N/A, no backend in scope.

**Quality**
- [x] Edge cases listed (10)
- [x] Testing criteria for happy path
- [x] Testing criteria for edge cases
- [x] Dependencies listed
- [x] Risk rated in the header

**Result: PASSED**
