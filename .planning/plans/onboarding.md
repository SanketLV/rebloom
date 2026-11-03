# Plan: Onboarding

**Spec**: .planning/specs/onboarding.md
**Design**: .planning/design/screens/onboarding.md (approved; prototype beside it)
**Epic**: none
**Created**: 2026-11-03
**Status**: draft
**Risk**: medium

**Stack**: Expo SDK 58 · Expo Router 58.0.26 · React Native 0.88 · jest-expo + @testing-library/react-native. No new packages.
**Branch**: `feature/onboarding` from `develop`, PR into `develop`.
**Baseline** (2026-11-03, on `develop`): 343 tests in 32 suites pass; `tsc --noEmit` is clean.

---

## Architecture

```
RootLayout (src/app/_layout.tsx)
  useState(readSeen)            read once, synchronously, before the first render
  OnboardingProvider            { finish(thenScan) , takeScanRequest() }
  Stack
  ├── Protected guard={!seen}   onboarding   pager, photos, text, fixed actions
  └── Protected guard={seen}    (tabs)       takes the scan request on mount, then pushes /scan
                                scan
                                settings
```

### Verified before planning

A throwaway test ran against the installed Router, then was deleted. It decided the design of the exit:

| Tried | Result |
|---|---|
| Unseen, open `/` | Lands on `/onboarding` |
| Unseen, deep link `/scan` | Lands on `/onboarding` |
| Seen, deep link `/onboarding` | Lands on `/` |
| Flip guard (Skip) | Lands on `/`, `canGoBack` false |
| Flip guard, then `router.push('/scan')` in the same tick | **Fails.** The push is dropped and the user lands on Today |
| Flip guard, then push from a `useEffect` in the root layout | **Fails.** Scan never opens, and onboarding stays in the back stack under Today |
| Flip guard, then push from a `useEffect` in `(tabs)/_layout` when it mounts | **Works.** `/scan` opens; Back lands on `/`; `canGoBack` false; no onboarding in history |

So "Scan a plant" sets a one-shot request, flips the guard, and `(tabs)/_layout` consumes the request on mount. Don't simplify this to a direct push. The spike used a plain `Stack` for the tabs layout, so Task 10's test must prove it on the real js-tabs layout.

The default `kv-store` instance is `new SQLiteStorage('ExpoSQLiteStorage')` (`node_modules/expo-sqlite/src/Storage.ts:474`), a separate database file from `rebloom.db`. There's no migration and no overlap with `sweepOrphanPhotos`, so risk stays medium.

### Components

| Component | Type | Purpose |
|---|---|---|
| `seen` | Module | `readSeen()` and `saveSeen()` over `kv-store`. Neither throws |
| `OnboardingProvider` | Context | `finish(thenScan)`, idempotent; `takeScanRequest()`, one-shot. Same pattern as `scan/session.tsx` |
| `SCREENS` | Data | Photo, focus, title and body for the 4 screens |
| `photoFrame` | Pure function | Cover size and top offset from screen size and focus |
| `OnboardingPage` | Component | One page: photo, photo-edge fade, top scrim, logo, text panel |
| `Logo` | Component | Wordmark paths from the brand kit; fills come in as props, so no hex |
| `useReduceMotion` | Hook | Current reduce-motion setting and its change event |
| `Button`, `TextButton` | Existing components | Gain an on-dark `tone`, an optional icon and a font-scale cap |
| Onboarding route | Route screen | Pager, index, dots, actions, Android Back, announcements |

### New files

| File | Location | Purpose |
|---|---|---|
| `seen.ts` | `app/src/onboarding/` | Seen flag |
| `context.tsx` | `app/src/onboarding/` | `OnboardingProvider`, `useOnboarding` |
| `screens.ts` | `app/src/onboarding/` | `SCREENS` |
| `photoFrame.ts` | `app/src/onboarding/` | Photo geometry |
| `OnboardingPage.tsx` | `app/src/onboarding/` | One page |
| `Logo.tsx` | `app/src/components/` | Wordmark |
| `useReduceMotion.ts` | `app/src/lib/` | Reduce-motion hook |
| `onboarding.tsx` | `app/src/app/` | The route |
| `seen.test.ts`, `photoFrame.test.ts` | `app/src/onboarding/__tests__/` | Unit tests |
| `Logo.test.tsx` | `app/src/components/__tests__/` | Unit test |
| `onboarding-flow.test.tsx` | `app/src/__tests__/` | Integration tests on the real route tree |

### Files to change

| File | What changes | Why |
|---|---|---|
| `app/src/testing/nativeMocks.ts` | Add `mockKvStore` and `kvStoreModule`; `resetNativeMocks` stores the flag as seen | Existing tests expect to land on Today |
| `app/jest.setup.ts` | `jest.mock('expo-sqlite/kv-store', …)` | It's a separate entry point from the `expo-sqlite` mock |
| `app/src/theme/tokens.ts` | Add `photoScrim` | Design doc |
| `app/src/components/Button.tsx` | `tone`, icon, font-scale cap | Dark green buttons disappear on the photos |
| `app/src/components/__tests__/Button.test.tsx` | Cover the above; create the file if it doesn't exist | |
| `app/src/app/_layout.tsx` | Read the flag, add the provider and guards, add the `onboarding` screen | Gating |
| `app/src/app/(tabs)/_layout.tsx` | Consume the scan request on mount | See "Verified before planning" |
| `app/src/__tests__/guards.test.ts` | Every file in `assets/onboarding/` is used by `screens.ts` | Spec testing criteria |

---

## Tasks

TDD throughout: failing test first, per global `CLAUDE.md` §3a. Each task is one commit.

### Phase 1: Foundation

| # | Task | Files | Test |
|---|---|---|---|
| 1 | Add the `kv-store` test double: a value map, `failRead`, `failWrite`, default seen | `nativeMocks.ts`, `jest.setup.ts` | All 343 existing tests still pass |
| 2 | `readSeen`, `saveSeen` | `seen.ts`, `seen.test.ts` | Missing is false; stored is true; a read that throws is **true**; a write that throws doesn't throw |
| 3 | `photoScrim` token | `tokens.ts` | Existing token and hex guard tests pass |
| 4 | `Logo`, from `rebloom-logo-bloom.svg` | `Logo.tsx`, `Logo.test.tsx` | Renders with the label "Rebloom"; hex guard passes |
| 5 | `Button` and `TextButton`: `tone="onDark"`, optional `icon`, `maxFontSizeMultiplier` | `Button.tsx`, `Button.test.tsx` | On-dark fill and label use the design doc tokens; defaults unchanged |
| 6 | `SCREENS` and `photoFrame` | `screens.ts`, `photoFrame.ts`, `photoFrame.test.ts` | Covers width and height at all 4 phone sizes; focus moves it up by the right amount |

### Phase 2: Screen (depends on Phase 1)

| # | Task | Files | Test |
|---|---|---|---|
| 7 | `OnboardingPage`: layers and text panel from the design doc; gradients with `stopOpacity`; title capped at 1.5×, body at 2× | `OnboardingPage.tsx` | Title and body render; logo only on screen 1; photo hidden from screen readers |
| 8 | Route: horizontal paging `ScrollView`, dots, Next, Skip, screen 4's actions, light `StatusBar`. Exits are stubbed until Task 10 | `onboarding.tsx`, `onboarding-flow.test.tsx` | Next walks 1–4 with the right titles; screen 4 has "Scan a plant" and "Look around first", and no Skip |
| 9 | `useReduceMotion`; announce each screen change; hide off-screen pages from screen readers | `useReduceMotion.ts`, `onboarding.tsx`, `onboarding-flow.test.tsx` | "Step 2 of 4. One leaf, one photo." is announced; other pages' text isn't reachable; reduce motion calls `scrollTo` with `animated: false` |

### Phase 3: Gate and exits (depends on Phase 2)

| # | Task | Files | Test |
|---|---|---|---|
| 10 | `OnboardingProvider`; guards in the root layout; request consumed in the tabs layout | `context.tsx`, `_layout.tsx`, `(tabs)/_layout.tsx` | See below; tests live in `onboarding-flow.test.tsx` |
| 11 | Android Back with `useFocusEffect` and `BackHandler`, as in `scan/questions.tsx` | `onboarding.tsx`, `onboarding-flow.test.tsx` | Back on 3 goes to 2; on screen 1 it isn't intercepted |
| 12 | Edge cases: swipe sync, rapid taps, width change | `onboarding.tsx`, `onboarding-flow.test.tsx` | See below |
| 13 | Guard that every photo is used; add the device checklist to `.handoff/onboarding.md` | `guards.test.ts`, `.handoff/onboarding.md` | Fails if a file in `assets/onboarding/` goes unused |

### Phase 4: Finish (depends on Phase 3)

| # | Task | Output |
|---|---|---|
| 14 | `npx expo lint`, `npx tsc --noEmit`, `npm test` | All green |
| 15 | Review pass per `review.md` | Findings in `review.md` §4's format |
| 16 | Break-test report per global `CLAUDE.md` §3a.3: report only, change no code, wait for the user | Numbered list |

Not planned: property tests and the swarm, which `review.md` requires only at high risk, unless the user asks. §3a.6's mass verification is decided after the break-test discussion.

### Order

| Parallel group | Tasks | Why |
|---|---|---|
| A | 2, 3, 4, 5, 6 | Independent files, once Task 1 is in |

| Sequential | Depends on | Why |
|---|---|---|
| 2 | 1 | Needs the double |
| 7 | 3, 4, 6 | Uses them |
| 8 | 5, 7 | Uses them |
| 9 | 8 | Same route |
| 10 | 2, 8 | Needs the flag and the route |
| 11, 12 | 10 | Same route and test file; run one at a time |
| 13 | 6 | Reads `screens.ts` |

---

## Implementation Notes

**Exits.** `finish` ignores calls after the first, so a double tap navigates once, whichever exit was tapped first. It takes the place of the spec's `useSingleFlight`: that hook releases as soon as its action resolves, so it wouldn't stop a second tap on a synchronous exit.

```ts
function finish(thenScan = false) {
  if (finished.current) return;
  finished.current = true;
  scanRequest.current = thenScan;
  saveSeen();
  setSeen(true);
}
```

**Rapid Next.** Screen 4 swaps the primary button's label in place, so a fast second tap on Next from screen 3 would land on "Scan a plant" and open the camera. Ignore the primary button for about 300ms after the index changes, and test it. This edge case came up during planning and is now in the spec.

**Index and scrolling.** Next updates the index and calls `scrollTo`. `onMomentumScrollEnd` sets the index from the offset, rounded and clamped to 0–3. On a width change, an effect calls `scrollTo` with `animated: false`, using `useWindowDimensions`.

**Announcing.** Announce on index change, not on mount: the screen reader already reads the first screen.

**Hidden pages.** Set `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"` on every page but the current one. Testing Library excludes hidden elements by default, so `queryByText` of another page's title is null until that page is current, which is the assertion.

**Dot animation.** Change instantly unless the built-in `Animated` version stays small. Motion isn't worth extra code here.

**Status bar.** The root sets `dark`. `onboarding.tsx` renders `<StatusBar style="light" />`; confirm it reverts after leaving, on the device checklist.

**Docs.** Per `app/AGENTS.md`, read the SDK 58 docs for `expo-status-bar` and the React Native 0.88 docs for `AccessibilityInfo` and `Text.maxFontSizeMultiplier` before Tasks 8–9. `Stack.Protected` and `kv-store` are already verified above.

**Test harness.** `renderRouter` uses fake timers, so a real `setTimeout` inside `act` hangs. Use `jest.runOnlyPendingTimers()` inside `act` and `screen.getPathname()` for navigation checks. Copy the `BackHandlerMock` from `scan-flow.test.tsx` for Task 11.

**Existing tests.** The double defaults to seen, so `navigation`, `scan-flow`, `my-plants` and `root-layout` need no edits. Onboarding tests clear the flag in `beforeEach`.

---

## Testing Plan

Maps to the spec's testing criteria.

**Data layer** (`seen.test.ts`): missing, stored, read throws, write throws.

**Logic** (`photoFrame.test.ts`, `Button.test.tsx`): photo geometry at 4 sizes, on-dark variant.

**Integration** (`onboarding-flow.test.tsx`, real route tree via `renderRouter('./src/app')`):

| Spec item | Test |
|---|---|
| First launch | No flag: opens on `/onboarding`, no Today tab |
| Walkthrough | Next through 1–4, right title on each |
| Skip | From each of screens 1–3: flag stored, lands on `/`, `canGoBack` false |
| Look around first | Flag stored, lands on `/` |
| Scan a plant | Flag stored, lands on `/scan`; closing lands on `/`; `canGoBack` false |
| Returning user | Flag stored: opens on Today; `/onboarding` isn't reachable |
| No permissions | `mockCamera.request` isn't called anywhere in the flow |
| Announcements | Step and title on each change |
| Edge 1: read throws | Opens on Today |
| Edge 2: write throws | Reaches Today, no crash |
| Edge 3: killed mid-flow | Remount with no flag: starts at screen 1 |
| Edge 4: double tap | Each exit navigates once; `mockCamera`'s screen opens once |
| Edge 5: rapid Next | Index stays in 0–3; a fast second tap from screen 3 doesn't open the camera |
| Edge 6: deep links | Unseen `/scan` lands on `/onboarding`; seen `/onboarding` lands on `/` |
| Edge 9: width change | `scrollTo` called with the new offset, `animated: false` |
| Edge 10: Back | Task 11's test; after finishing, Back from Today doesn't return |
| Reduce motion | `scrollTo` with `animated: false` |

**Guards** (`guards.test.ts`): existing hex check, plus every photo used.

**Device checklist** (`.handoff/onboarding.md`, not blocking): photos on Android and iOS with no flash; fade quality; contrast on all 4 screens; iPhone SE at 200% text (edge 7); edge 8; VoiceOver and TalkBack through the flow, including hidden pages; swipe feel; gesture Back; status bar reverting; how the scan modal looks opening over Today.

---

## Gate 2

**Architecture**
- [x] Follows existing patterns: routes in `src/app`, feature code outside it, context like `scan/session.tsx`, `BackHandler` like `scan/questions.tsx`
- [x] Each layer only calls the layer below: route → context → `seen` → `kv-store`
- [x] Components are in the right directories

**Task breakdown**
- [x] All files to change are listed
- [x] All new files are listed with their locations
- [x] Each task is small, at most 3 files (Task 10 adds the shared flow test as a fourth)
- [x] Dependencies are clear
- [x] Parallel and sequential tasks are marked

**Testing**
- [x] Data layer tests planned
- [x] Business logic tests planned
- [x] Integration tests planned
- [x] UI tests planned
- [x] Spec edge cases are covered, with 7 and 8 on the device checklist

**Result: PASSED**
