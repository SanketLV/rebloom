# Spec: App Skeleton

**Created**: 2026-10-20
**Status**: draft
**Author**: Sanket
**Epic**: none

**Sources**: Notion "AI Plant Doctor App" → Tech Stack, Screens & User Flow, Brand & Design · Design canvas "Rebloom App Screens" (https://claude.ai/artifact/1ief2yordgFEYCVaYV41qW), artboard 10 Today for the tab bar

---

## Problem

Rebloom has a full MVP design (27 artboards) and a chosen stack, but no code. Every MVP feature (scan, diagnosis, treatment, day-7 check-in, paywall) needs the same base: an Expo project, the brand colors and fonts, the tab navigation and a repo layout. Without that base, each feature would make its own choices about color, type and structure, and the app would drift away from the design.

## Goal

Running `npx expo start` in `app/` opens a light-themed app on iOS and Android. It shows the three-part tab bar from the design (Today · raised Scan button · My Plants), uses Bricolage Grotesque and Figtree, and takes every color from one tokens file. Scan opens a full-screen modal. The profile icon on Today opens Settings. `typecheck`, `lint` and `test` all pass.

## User Stories

- As the **developer**, I want one tokens file and one shell to build every screen into, so new screens match the design without copying hex codes around.
- As a **plant owner**, I want to open the app and see Today, Scan and My Plants right away, so I can reach the scan from any screen in one tap.

## Requirements

### Must-have

**Repo layout** (one git repo, no workspace tooling):
```
rebloom/
├── app/        Expo app (this spec)
├── landing/    empty for now, gets its own spec
├── supabase/   empty for now, gets its own spec
├── .planning/
└── .gitignore
```
- `git init` on `main` with a `develop` branch, following the CLAUDE.md branching rules.

**App (`app/`)**
- Expo, latest stable SDK, TypeScript `strict`, Expo Router (file-based routing).
- `userInterfaceStyle: "light"` in app config.
- App name "Rebloom", slug `rebloom`, scheme `rebloom`. Bundle IDs are placeholders (`com.rebloom.app`) until the store accounts exist.

**Design tokens**: `app/src/theme/tokens.ts`, the only place hex values live:

| Token | Hex | Use |
|---|---|---|
| `bg` | `#E8E9DF` | App background |
| `surface` | `#FAFAF5` | Cards, sheets, tab bar |
| `text` | `#1E2619` | Body and headings |
| `textSecondary` | `#4F5947` | Labels, helper text |
| `line` | `#D4D7C6` | Borders, dividers |
| `primary` | `#2E3D28` | Main buttons, active tab, Scan button |
| `primaryTint` | `#A9B887` | Chips, icon backgrounds |
| `accent` | `#5A3E2B` | Follow-up moments, secondary buttons |
| `accentTint` | `#F2DFC2` | Check-in cards |
| `reward` | `#BFE23A` | Wins only; never text on a light background |
| `healthy` / `healthyBg` | `#2F7041` / `#DCEBD9` | Healthy / done |
| `warning` / `warningBg` | `#8A5600` / `#F6E3BD` | Needs attention |
| `severe` / `severeBg` | `#A8261E` / `#F7DEDA` | Severe, errors |

Plus radius (`sm 14`, `md 20`, `lg 24`, `pill 999`), spacing on a 4px base (`4 / 8 / 12 / 16 / 24 / 32`), and type styles taken from the artboards (screen title 36/700 Bricolage, section 18/700 Figtree, body 16, caption 14, tab label 12).

**Fonts**: Bricolage Grotesque (600, 700) and Figtree (400, 500, 600, 700, 800), loaded with `@expo-google-fonts/*` and `expo-font`. The splash screen stays up until the fonts load or fail.

**Navigation**
- `(tabs)` group: `index` (Today) and `plants` (My Plants), with a custom tab bar that matches artboard 10:
  - `surface` background, 1px `line` top border.
  - Active tab label and icon `primary` at weight 800; inactive `textSecondary` at 600.
  - Center Scan button: 60×60 circle, `primary` fill, `reward` camera icon, raised 28px above the bar, with the label "Scan" under it.
- `scan` route: full-screen modal (`presentation: "fullScreenModal"`) with a close button. Closing it returns to the tab you came from.
- `settings` route: a stack screen pushed from the profile icon (44×44, top right of Today).
- Placeholder screens: title in the right style, one line saying which artboard it becomes, `bg` background, safe-area padding.
- Icons: the stroke SVGs from the design via `react-native-svg`. No icon library.

**Quality tooling**
- Scripts: `typecheck` (`tsc --noEmit`), `lint` (`expo lint`), `test` (`jest-expo` + React Native Testing Library).

### Nice-to-have
- `app/README.md` with how to run, test and lint.
- A path alias (`@/` → `app/src/`).

### Out of scope (each gets its own spec)
- Supabase client, auth (including anonymous sign-in) and `supabase init`
- Camera, gallery, on-device model, Kindwise Router
- RevenueCat / paywall, notifications, WeatherKit, PostHog, Sentry
- EAS config and dev-client builds
- Building any real screen beyond the placeholders
- Dark mode (planned later, based on Option D Night Greenhouse)
- Motion, haptics, Reanimated and Rive
- Landing page and waitlist

## Data Model

None. This spec has no backend.

## API Changes

None.

## UI Changes

| Route | Type | Design reference |
|---|---|---|
| `/(tabs)/index` | Tab: Today | 10 Today (placeholder + profile icon) |
| `/(tabs)/plants` | Tab: My Plants | 11 My Plants (placeholder) |
| `/scan` | Full-screen modal | 04 Camera (placeholder + close) |
| `/settings` | Stack push | 16 Settings (placeholder + back) |
| Tab bar | Custom component | 10 Today, `<nav>` block |

## Edge Cases

1. **Fonts fail or load slowly.** Keep the splash up while they load. If loading errors, hide the splash and fall back to the system font; never block the app.
2. **Safe areas.** The tab bar's bottom padding uses the safe-area inset, so it clears the iPhone home indicator and the Android gesture/nav bar. The raised Scan button isn't clipped by the bar or its parent.
3. **Small screens and large text.** Works on iPhone SE (375×667) and with the system font at 200%: tab labels don't overlap, and titles wrap instead of truncating. Touch targets stay ≥44×44.
4. **Device in dark mode.** The app stays light because `userInterfaceStyle` is `light`, and no component reads the system color scheme.
5. **Android back button.** Back from Settings or Scan returns to the tab you came from. Back on a root tab exits the app (the default, not overridden).

## Testing Criteria

### Happy path
- [ ] `tokens.ts` exports every role in the table above with exactly those hex values (snapshot test).
- [ ] The tab bar renders Today, Scan and My Plants. The active tab has `accessibilityState.selected = true`.
- [ ] Pressing the Scan button navigates to `/scan`; pressing close goes back.
- [ ] Pressing the profile icon on Today navigates to `/settings`.
- [ ] Every interactive element has an `accessibilityLabel` and `accessibilityRole`.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` all pass.

### Edge cases
- [ ] With a font load error mocked, the root layout still renders its children.
- [ ] With the bottom safe-area inset mocked to 34, the tab bar adds it to its bottom padding.
- [ ] No source file outside `src/theme/` contains a hex color literal (grep check in the test suite).
- [ ] Manual check on a device or simulator: iPhone SE size, 200% text, dark mode on, Android back button.

## Dependencies

- Node 24 and npm (installed)
- Expo Go on a phone, or an iOS simulator / Android emulator, for the manual checks
- npm packages: `expo`, `expo-router`, `expo-font`, `expo-splash-screen`, `@expo-google-fonts/bricolage-grotesque`, `@expo-google-fonts/figtree`, `react-native-svg`, `react-native-safe-area-context`, `jest-expo`, `@testing-library/react-native`

## Open Questions

- Palette hex codes were read off video frames (Brand & Design page). Treat the table as final for now; one change in `tokens.ts` updates them everywhere if they get verified later.

---

## Gate 1

**Completeness**
- [x] Problem is clearly stated
- [x] Goal is specific and measurable (app runs, 3 checks pass, routes work)
- [x] At least one user story
- [x] Requirements split into must-have, nice-to-have, out of scope
- [x] Out of scope section exists

**Data Model / API**: N/A, no backend in scope.

**Quality**
- [x] Edge cases listed (5)
- [x] Testing criteria for happy path
- [x] Testing criteria for edge cases
- [x] Dependencies listed

**Result: PASSED**
