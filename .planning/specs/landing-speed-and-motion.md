# Spec: Landing page speed fixes and native scroll animations

**Created**: 2026-11-04
**Status**: draft
**Author**: Sanket
**Epic**: none
**Risk**: medium (the hero markup holds the waitlist form, and a hydration or layout mistake could stop sign-ups; nothing stored server-side changes)

---

## Problem

The landing page's text jumps when web fonts load (CLS above 0.1 at 9 of 12 tested widths), a symptom photo stays blank for up to 607 ms after its chip is tapped on slow 4G, and the hero shows flat olive for about 250 ms after first paint. The page also has no scroll motion, so it feels static next to its cinematic photography. The JS bundle is 74.0 of its 75 KB budget, so an animation library can't be added without raising that limit.

## Goal

The page stops jumping, photos are ready when visitors reach them, and scroll motion is added with no new runtime dependency. Success is measured against the baseline below, under the same test conditions.

### Baseline (2026-11-04, local production build, gzip, cache off)

| Measure | Mobile | Tablet | Laptop |
|---|---|---|---|
| Lighthouse viewport | 412×823 | 768×1024 | 1350×940 |
| Performance score | 91 | 95 | 97 |
| FCP | 1.7 s | 0.8 s | 0.5 s |
| LCP | 2.1 s | 0.9 s | 0.5 s |
| TBT | 0 ms | 0 ms | 0 ms |
| CLS | 0.163 | 0.132 | 0.103 |
| Chip tap to photo (real throttling) | 366–607 ms | 143–185 ms | 51–64 ms |

CLS by width at 4 Mbps, 100 ms latency (3 runs each, middle value):

| 360 | 375 | 390 | 412 | 430 | 768 | 820 | 1024 | 1280 | 1350 | 1440 | 1920 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.182 | 0.169 | 0.157 | 0.164 | 0.130 | 0.131 | 0.241 | 0.137 | 0.119 | 0.099 | 0.095 | 0.046 |

Test conditions:
- **Lighthouse 12:** simulated throttling, 3 runs per device, median run. Mobile and laptop use the default mobile and desktop presets. Tablet uses 9 Mbps, 80 ms RTT, 2x CPU.
- **Real throttling:** Chrome through CDP. Mobile is 390×844, 1.6 Mbps, 150 ms, 4x CPU. Tablet is 768×1024, 9 Mbps, 80 ms, 2x CPU. Laptop is 1440×900, 30 Mbps, 20 ms.

### Targets

- CLS at or below 0.1 at all 12 widths, in every run.
- Lighthouse performance at or above 95 on mobile, tablet and laptop.
- Mobile LCP at or below 1.8 s, with no worse LCP on tablet or laptop.
- Chip tap to photo within 100 ms on all three devices once the preload has finished.
- Lighthouse `uses-responsive-images` passes on all three devices.
- JS stays within the existing 75 KB budget, with no new runtime dependency.
- Accessibility, best practices and SEO stay at 100.

## User Stories

- As a **visitor on a slow phone**, I want the headline to stay still while the page loads, so I don't lose my place or mis-tap.
- As a **visitor comparing plant symptoms**, I want each photo to appear as soon as I tap its chip, so I can match it against my plant.
- As a **visitor scrolling the page**, I want sections to arrive with light motion, so the page feels polished without slowing me down.
- As a **visitor sensitive to motion**, I want gentler or no movement, so the page stays comfortable.
- As a **visitor whose scripts fail**, I want all content visible and the form usable, so I can still join.

## Requirements

### Must-have

**Fonts**
- Self-host the latin subsets of Figtree and Instrument Serif as `woff2` in `landing/public/fonts/`, with their OFL license text.
- Remove the Google Fonts links and preconnects from `index.html` and `privacy.html`. Keep the Supabase preconnect in `index.html`.
- Preload the fonts used above the fold.
- Add metric-matched fallback faces covering Windows, macOS/iOS and Android system fonts. If this can't meet the CLS target, use `font-display: optional` for the affected face and record why in the plan.
- Remove the Google Fonts sentence from the privacy page, since it would no longer be true.

**Images**
- Render the hero photo as `<picture>` with an `<img alt="" fetchpriority="high">`, keeping today's wide and tall art direction and crop, including the phone mask and lift.
- Render the closing photo as `<picture>` with a lazy `<img alt="">`, so it isn't requested on first load.
- Add `srcset` and `sizes` to in-page photos, with a smaller variant of about 480 px wide. Generate variants once and commit them; add no image build step.
- Load the three hidden symptom photos as the section nears the viewport, picking the same `srcset` candidate the visible image would use, so nothing downloads twice.
- Skip that preload when `navigator.connection.saveData` is true. Tapping a chip still loads its photo.

**Motion**

All motion uses `transform` and `opacity` only. The shared curve is `cubic-bezier(0.23, 1, 0.32, 1)` unless scroll-linked.

| # | Where | Motion | Reduced motion |
|---|---|---|---|
| 1 | Symptom photo and entry, on chip change | Fade in, 200 ms. Never on first paint | No animation |
| 2 | How it works steps 1–3, Our promise rows | `opacity: 0`, `translateY(16px)` to settled, 500 ms, 60 ms stagger, once | Opacity only, 200 ms |
| 3 | Hero photo on load | `opacity: 0→1`, `scale(1.03→1)`, 700 ms, CSS only | Opacity only, 200 ms |
| 4 | Closing photo on scroll | Scroll-linked `scale(1.08→1)` with `animation-timeline: view()` inside `@supports` | No animation |
| 5 | Chip labels, Join button | `:active { transform: scale(0.97) }`, 160 ms | No scale |

**Safety**
- Content is visible with no JS, and if the bundle fails to load or arrives late. Reveal state is set only after hydration, only on items fully below the viewport, and only where `IntersectionObserver` exists.
- Server and first client render stay identical, with no hydration warnings.
- Waitlist behavior is unchanged, including sign-ups queued before React loads and the `RootBoundary` fallback.
- `RecoveryPanel` keeps its autoplay and is excluded from the reveal.
- `privacy.html` still ships no JavaScript.

**Build checks (`scripts/check-dist.mjs`)**
- Replace the two Google Fonts preconnect checks with a check that no page references a Google Fonts host.
- Check that every `srcset` URL resolves, since the current URL check reads only `src`, `href` and `content`.
- Keep the old-browser CSS checks and the 75 KB budget unchanged.

### Nice-to-have

- A `public/_headers` file with a longer cache for fonts and photos. Filenames aren't hashed, so use a bounded lifetime, not `immutable`. Do this only after confirming the live site's current `cache-control`.
- Keep the measurement scripts in the repo if they add no runtime dependency to the site.

### Out of scope

- Motion, GSAP and Lenis, or any other animation library.
- Raising the JS budget.
- Shimmer skeletons. Photos keep their `bg-photo` placeholder.
- Entrance animation on the headline or waitlist form.
- Pinned or scrubbed sections, and custom scrolling.
- Copy, layout or new sections.
- Replacing React or reducing its bundle size.
- Merging the Cloudflare deploy branch.
- Device-only checks blocking review. They go on the device checklist in `.handoff/`.

## Data Model

None.

## API Changes

None. The waitlist RPC is unchanged.

## UI Changes

- **Hero:** the background layer becomes `<picture>`, with the same look.
- **Final section:** the background layer becomes a lazy `<picture>`, with the same look.
- **Field notes, How it works, Our promise:** responsive images and the motion above.
- **Privacy page:** font sentence removed, plus self-hosted fonts.

Must look the same at rest at 375, 768, 1366×768 and 1440, in pages and in screenshots compared with today's build. No new screens or states.

## Edge Cases

- **JS fails or arrives late:** everything stays visible and the guard still handles sign-ups.
- **Scrolled before hydration, or restored by Back:** items already passed or in view are not hidden.
- **`#how` anchor jump:** the target's items reveal, with nothing left invisible above or below.
- **Fast scroll to the bottom:** reveals finish and nothing stays hidden.
- **Printing:** all reveal content is visible.
- **Reduced motion, including when changed mid-visit:** no reveal travel or scale, and hidden items still appear.
- **Chip tapped before the preload finishes:** the placeholder shows, then the photo; rapid taps always end on the last chip.
- **Preload fails or Save-Data is on:** the photo loads on tap, with no error.
- **Slow hero photo:** the olive background stays underneath and text stays readable. LCP doesn't regress from the fade.
- **Phone rotated:** the hero and closing photos switch art direction with the same crop rules.
- **No `animation-timeline` support:** the closing photo stays static and fully covers its section, with no overflow.
- **Android has no Times New Roman or Georgia:** the fallback stack still meets the CLS target.
- **Font request fails:** fallback text stays readable and doesn't overflow at any width.
- **Screen readers and keyboard:** content in a reveal is still read and focusable; focus doesn't land on invisible content.
- **Old iOS in-app browsers (Safari 14):** page works, with no `:has()`, `@layer` or CSS nesting in the output.

## Testing Criteria

**Happy path**
- All targets are met under the baseline test conditions, with results recorded in the PR.
- Chips show the right photo, caption and entry.
- Reveal runs once per item.
- A sign-up from both forms works on the local stack.

**Edge cases**
- Hydration test: no warnings or recoverable errors with the new markup, and nothing is hidden in server HTML.
- Unit tests: only below-the-viewport items get reveal state; nothing is hidden without `IntersectionObserver`; Save-Data skips preloading.
- Real browser: no-JS and blocked-bundle runs show all content; network log shows no duplicate photo downloads and no closing photo on first load.
- Reduced-motion emulation matches the table.
- `npm run build` passes all updated checks.

**Process (medium risk, per `review.md`)**
- Typecheck, lint, unit tests, integration tests and one review pass.
- Break-test report after green, with findings reported and not fixed until discussed.

## Dependencies

- Branch from `origin/develop`. `landing/` currently matches on `develop`, `main` and this branch.
- Figtree and Instrument Serif, both OFL.
- No new runtime dependency.

## Open Questions

- **Live URL:** not in the repo. The deploy config is only on `origin/claude/tender-faraday-7wxh1v`, unmerged with no PR. Live results and the `_headers` item depend on it, but the rest doesn't.

## Gate 1

- [x] Problem clearly stated
- [x] Goal specific and measurable
- [x] At least one user story
- [x] Requirements split into must-have, nice-to-have, out of scope
- [x] Data model and API sections: not applicable
- [x] At least 3 edge cases
- [x] Testing criteria for happy path and edge cases
- [x] Dependencies listed
