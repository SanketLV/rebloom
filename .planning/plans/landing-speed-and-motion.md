# Plan: Landing page speed fixes and native scroll animations

**Spec**: .planning/specs/landing-speed-and-motion.md
**Epic**: none
**Created**: 2026-11-04
**Status**: draft
**Risk**: medium

---

## Decisions checked against the code and a browser (2026-11-04)

| Topic | Decision | Why |
|---|---|---|
| **CLS root cause** | Hero text widths move from `ch` to `em` as well as adding fallback fonts | `ch` changes with the font, so the boxes resize when fonts land. Measured fallback vs web font: at 390 px, `h1` 358 vs 291 px wide, intro 3 vs 2 lines, note 3 vs 2 lines, hero block 534 vs 487 px tall. At 820 px the note row also wraps differently (568 vs 610 px). The block is pinned to the bottom with `mt-auto`, so everything moves. |
| `em` values | `h1` `max-w-[5.06em]`, intro `max-w-[21.8em]`, note `max-w-[19.2em]` | Computed from today's web-font widths, so the loaded page looks the same. Screenshot comparison confirms it. |
| Other `ch` widths | Unchanged | They sit below the fold, so they aren't on screen when the fonts land. |
| Font files | Google's latin `woff2`: one variable Figtree file (covers 400–700) and Instrument Serif, in `public/fonts/`, plus OFL text | Same files visitors get today, at 19.7 KB and 14.7 KB. Plain public URLs match how `/assets/` works. |
| Fallback faces | `Instrument Serif Georgia`, `Instrument Serif Noto`, `Figtree Arial`, `Figtree Roboto`, using `local()` with `size-adjust` and ascent/descent overrides | Georgia and Arial cover Windows, macOS and iOS. Noto Serif and Roboto cover Android. `local()` skips to the next face when a font is missing. |
| Metric values | Computed once with `@capsizecss/metrics` and `@capsizecss/unpack`, run outside the repo, and committed as CSS numbers with a comment | No new dependency for a calculation that doesn't change. |
| Chip preload | Flip hidden photos from `loading="lazy"` to `"eager"` when the section is within 600 px of the viewport | Spike in Chrome: the flip fetched a `display: none` image, picked the right `srcset` candidate and made one request. `new Image()` would need its own `srcset` and `sizes` and risks a second download. |
| Photo variants | One 480 px `-480.webp` for each of the 10 in-page photos, made by a small PIL script | PIL is already used in `brand/source/`. Hero and closing photos keep their current files, since they're already art-directed and small. |
| `srcset` helper | `src/lib/photos.ts`, used by 4 components | Keeps variant naming in one place. |
| Hero and closing photos | `<picture>` inside the existing `.hero-media` and `.final-media`, which keep the mask, inset and olive background | Art direction moves from CSS to `<source media="(max-aspect-ratio: 4/5)">` with the same breakpoint. React doesn't auto-preload images inside `<picture>`, but the preload scanner finds them in the HTML. |
| Reveal | One function in `src/lib/reveal.ts`, called from a `LandingPage` effect, finding `[data-reveal]` items. No wrapper component | Runs only after hydration, so server HTML and the `RootBoundary` fallback never contain hidden content. |
| Reveal state | The DOM attribute `data-reveal-state`, which React doesn't render or overwrite | Prevents hydration mismatches and re-renders undoing it. |
| Stagger | 60 ms by position within each `IntersectionObserver` batch | Phones get one item at a time with no delay. Laptops get the row staggered. A fixed index would delay the third phone item by 120 ms for no reason. |
| Reduced motion | CSS media queries only | Also handles a setting changed mid-visit. |
| Chip fade | CSS animation on items in a `data-swap` container, set only from `onChange` | Removing `hidden` restarts a CSS animation, so no crossfade stack is needed. Nothing animates on first paint or for a chip picked before hydration. |
| JS budget | Stay at 75 KB. Headroom is 1.0 KB. If a task breaks it, stop and ask | The limit was your decision, and the spec rules out raising it. |
| Lint | `tsc --noEmit` and tests, as today | `landing/` has no ESLint, which corrects the spec's process line. Adding it isn't in scope. |
| Measuring | Scripts copied to `.handoff/landing-perf/` (gitignored). Not committed | They need Lighthouse and `playwright-core`, which the site doesn't. This settles the spec's nice-to-have. |
| `_headers` | Not in this plan | Depends on the live URL and the unmerged deploy branch. |
| **Branch** | `feature/landing-speed-motion` from `origin/develop`, PR into `develop` | `develop` is 10 commits ahead of `main` and 0 behind. `landing/` matches on both. |

## Architecture

### Components

| Component | Type | Purpose |
|---|---|---|
| `srcSetFor` | Helper | Builds a photo's `srcset` |
| `startReveal` | Helper | Sets reveal state and observes items |
| `Hero`, `Final` | Component | Render `<picture>` photos |
| `FieldNotes` | Component | Responsive photos, preload, chip fade |
| `HowItWorks`, `OurPromise`, `RecoveryPanel` | Component | Responsive photos; first two get `data-reveal` |
| `LandingPage` | Page | Starts and cleans up the reveal |

### New files

| File | Location | Purpose |
|---|---|---|
| `figtree-latin.woff2`, `instrument-serif-latin.woff2` | `landing/public/fonts/` | Self-hosted fonts |
| `OFL-Figtree.txt`, `OFL-InstrumentSerif.txt` | `landing/public/fonts/` | License text |
| `*-480.webp` (10 files) | `landing/public/assets/` | Small photo variants |
| `make-photo-variants.py` | `landing/scripts/` | Generates the variants |
| `photos.ts`, `photos.test.ts` | `landing/src/lib/` | `srcset` helper and test |
| `reveal.ts`, `reveal.test.ts` | `landing/src/lib/` | Reveal logic and test |

### Files to change

| File | What changes | Why |
|---|---|---|
| `landing/index.html` | Remove Google links; add font preloads | Fonts |
| `landing/privacy.html` | Remove Google links | Fonts |
| `landing/tailwind.config.ts` | Font stacks with fallback faces | CLS |
| `landing/src/index.css` | `@font-face`, photo layers, motion | All three areas |
| `landing/scripts/check-dist.mjs` | Google, `srcset`, picture and motion checks | Protects requirements |
| `landing/src/pages/PrivacyPage.tsx` | Remove the Google Fonts sentence | Must stay true |
| `landing/src/components/Hero.tsx` | `em` widths, `<picture>` | CLS, LCP |
| `landing/src/components/Final.tsx` | Lazy `<picture>` | First-load weight |
| `landing/src/components/FieldNotes.tsx` | `srcset`, preload, fade | Chip delay |
| `landing/src/components/HowItWorks.tsx`, `OurPromise.tsx` | `srcset`, `data-reveal` | Weight, motion |
| `landing/src/components/RecoveryPanel.tsx` | `srcset` only | Weight |
| `landing/src/pages/LandingPage.tsx` | Reveal effect | Motion |
| `landing/src/components/FieldNotes.test.tsx` | Preload, Save-Data and fade tests | Tests |
| `landing/src/pages/LandingPage.hydration.test.tsx` | New-markup, reveal and crash tests; `unobserve` on the stub | Tests |

No changes to `WaitlistForm.tsx` logic, `early-submit.ts`, `waitlist.ts` or `RootBoundary.tsx`.

## Tasks

Each task is one commit, written test-first where a test applies. Run `npm test` and `npm run build` after each. Commits carry no Claude co-author.

### Phase 0: Setup

| # | Task | Files |
|---|---|---|
| 1 | Create the branch from `origin/develop`, then commit the spec and plan. Save "before" screenshots from a clean build at 375, 768, 1366×768 and 1440 to `.handoff/landing-perf/before/` | spec, plan |

### Phase 1: Fonts and layout jump (depends on 0)

| # | Task | Files |
|---|---|---|
| 2 | **Red:** in `check-dist`, replace the two Google preconnect checks with "no page references `fonts.googleapis.com`, `fonts.gstatic.com` or `Google Fonts`" and require a font preload on `index` | `check-dist.mjs` |
| 3 | Add fonts and licenses. Compute metrics. Add `@font-face` and fallback faces, and update the Tailwind stacks | `public/fonts/*`, `index.css`, `tailwind.config.ts` |
| 4 | **Green:** remove Google links from both templates, add preloads to `index.html`, and remove the privacy sentence | `index.html`, `privacy.html`, `PrivacyPage.tsx` |
| 5 | Move hero widths to `em`. With web fonts blocked, confirm line counts match the loaded page at all 12 widths. Re-run CLS and compare screenshots | `Hero.tsx` |

**Checkpoint:** CLS at or below 0.1 at all 12 widths. If not, use `font-display: optional` for the failing face, as the spec allows, and record why here.

### Phase 2: Images (depends on 1)

| # | Task | Files |
|---|---|---|
| 6 | Generate the variants. Keep each original if its variant isn't smaller | `make-photo-variants.py`, `public/assets/*-480.webp` |
| 7 | **Red, then green:** `srcSetFor` test and helper. Extend the `check-dist` URL scan to `srcset` and `imagesrcset`, case-insensitive, because React writes `srcSet` | `photos.ts`, `photos.test.ts`, `check-dist.mjs` |
| 8 | Add `srcset` and `sizes` to Field notes and Our promise | `FieldNotes.tsx`, `OurPromise.tsx` |
| 9 | Add `srcset` and `sizes` to How it works and the recovery panel. Keep width and height attributes | `HowItWorks.tsx`, `RecoveryPanel.tsx` |
| 10 | **Red:** `check-dist` requires a hero `<img>` with `fetchpriority="high"`, a lazy closing `<img>`, and no `url(/assets/hero` or `url(/assets/lush` in CSS. **Green:** hero `<picture>` and CSS | `check-dist.mjs`, `Hero.tsx`, `index.css` |
| 11 | **Green:** closing `<picture>` and CSS. Compare screenshots, including the phone mask and portrait/landscape | `Final.tsx`, `index.css` |
| 12 | **Red, then green:** Field notes preload: flips to eager near view, skips on Save-Data, stays lazy without `IntersectionObserver`, and disconnects on unmount | `FieldNotes.tsx`, `FieldNotes.test.tsx` |

`sizes` values:

| Photos | `sizes` |
|---|---|
| Symptoms | `(min-width: 1280px) 520px, (min-width: 900px) 42vw, 100vw` |
| Steps | `(min-width: 1280px) 400px, (min-width: 760px) 32vw, 100vw` |
| Recovery | `(min-width: 1280px) 480px, (min-width: 760px) 40vw, 100vw` |
| Promise | `(min-width: 1280px) 500px, (min-width: 900px) 40vw, 100vw` |

**Checkpoint:** in a browser, one request per photo, no closing photo on first load, and `uses-responsive-images` passes on all three devices.

### Phase 3: Motion (depends on 2)

| # | Task | Files |
|---|---|---|
| 13 | **Red, then green:** `startReveal`: hides only items fully below the viewport, skips everything without `IntersectionObserver`, shows on intersect once, staggers by batch, and cleans up | `reveal.ts`, `reveal.test.ts` |
| 14 | Add `data-reveal` to steps 1–3 and promise rows, plus the reveal CSS with reduced-motion and print rules. `RecoveryPanel` gets none | `HowItWorks.tsx`, `OurPromise.tsx`, `index.css` |
| 15 | **Red, then green:** `LandingPage` effect. Hydration tests: no reveal state in server HTML, no mismatch, and the crash fallback shows everything | `LandingPage.tsx`, `LandingPage.hydration.test.tsx` |
| 16 | **Red, then green:** chip fade on change only, not on first render or an early pick | `FieldNotes.tsx`, `FieldNotes.test.tsx`, `index.css` |
| 17 | Hero fade and press feedback. Re-run LCP. If mobile LCP misses the target, drop the fade's starting opacity to a visible value and re-measure | `index.css` |
| 18 | **Red:** `check-dist` requires `animation-timeline` inside `@supports` in built CSS, to catch the minifier removing it. **Green:** closing photo scroll-linked scale | `check-dist.mjs`, `index.css` |

Motion values come from the spec's table. The curve is a CSS variable, `--ease-out`, in `index.css`.

**Checkpoint:** JS at or below 75 KB. Stop and ask if it isn't.

### Phase 4: Verify (depends on 3)

| # | Task | Files |
|---|---|---|
| 19 | Re-run all baseline measurements and put before/after numbers in the PR | none |
| 20 | Real-browser edge cases, per the testing plan below | none |
| 21 | A sign-up from each form on the local Supabase stack | none |
| 22 | One review pass with `review.md`. Add device checks to `.handoff/landing-speed-and-motion.md` | handoff |
| 23 | Break-test report. **Report only, then stop for discussion** | none |

### Parallel vs sequential

| Parallel group | Tasks | Why |
|---|---|---|
| A | 8, 9 | Different components, both need 7 |
| B | 2, 6 | Independent files |

| Sequential | Depends on | Why |
|---|---|---|
| 3, 4, 5 | 2 and each other | Fonts must exist before links go and before the wrap check |
| 7 | 6 | Variants must exist |
| 10, 11 | 5 | Parity is compared on stable text |
| 12 | 8 | Preload relies on `srcset` being in place |
| 15 | 13, 14 | Needs the function and the markup |
| 16, 17, 18 | Phase 2 | Same `index.css` sections; no two writers |
| 19–23 | All | Verify the finished work |

## Testing Plan

Data layer and API tests don't apply: the spec changes neither.

| Level | Test | Spec item |
|---|---|---|
| Unit | `srcSetFor` builds the 480 and full-size candidates | Images |
| Unit | Reveal hides only below-viewport items; shows once; staggers per batch; disconnects | Safety, Motion 2 |
| Unit | No `IntersectionObserver` means nothing is hidden | Safety |
| Unit | Preload near view; Save-Data skip; rapid taps end on the last chip | Images, Edge cases |
| Unit | Fade only after a change | Motion 1 |
| Integration | Hydration with no warnings using the new markup | Safety |
| Integration | Existing early-submit and fallback tests still pass unchanged | Waitlist unchanged |
| Integration | `RootBoundary` fallback shows all content after reveal has started | Safety |
| Build | `check-dist`: no Google references, every `srcset` URL resolves, picture attributes, `animation-timeline` kept, old-browser CSS, budget, `privacy` has no JS | Build checks |
| Browser | CLS at 12 widths, 3 runs; Lighthouse on 3 devices; chip timing | Targets |
| Browser | Screenshots vs "before" at 4 widths | UI Changes |
| Browser | JS disabled; bundle blocked; font requests failing at all 12 widths | Edge cases |
| Browser | Reload mid-page and Back; `#how` jump; instant jump to bottom then scroll up | Edge cases |
| Browser | Print preview; reduced-motion emulation, including a mid-visit change | Edge cases |
| Browser | Save-Data, a failed preload request, phone rotation | Edge cases |
| Browser | Sign-up from both forms; sign-up tapped before JS loads | Happy path |
| Device | Android: Roboto and Noto Serif fallbacks. iOS: lazy-to-eager flip, `svh` crop, in-app browser | Device checklist, not blocking |

## Gate 2

**Architecture**
- [x] Follows existing patterns: pre-rendered React, Tailwind utilities with `index.css` for the rest, `lib/` helpers, `check-dist` for build rules
- [x] Layers: components call `lib/` helpers only
- [x] Components in the right directories

**Task breakdown**
- [x] All files to change listed
- [x] All new files listed with locations
- [x] Tasks are small, at most 3 code files, with asset batches counted as one
- [x] Dependencies clear
- [x] Parallel vs sequential marked

**Testing**
- [x] Data layer and API tests: not applicable, recorded above
- [x] Business logic tests planned
- [x] Integration tests planned
- [x] UI tests planned
- [x] Spec edge cases covered

## Build notes (2026-11-04)

Changes from the plan, found by measuring:

- **Chip preload watches the plate with a 100 px margin, not the section with 600 px.** The section starts at the fold, so it counted as near on page load and fetched 3 photos (about 171 KB) for every visitor.
- **Photos have three versions, not two:** 480, 720 and the original (480, 600 and the original for the recovery photos), with `sizes` matched to measured column widths. With two, `uses-responsive-images` failed on mobile and tablet.
- **Commits are grouped by phase,** as `/spartan:build` asks, not one per task.
- **The waitlist check uses a mocked RPC, not the local stack.** `WAITLIST.url` is fixed to production in `lib/waitlist.ts`, so a real sign-up from the built page would reach production.
- **Mobile LCP target missed.** Simulated LCP is 2.1 s against a 1.8 s target, the same as the baseline, and stays 2.1 s with the hero fade removed.
