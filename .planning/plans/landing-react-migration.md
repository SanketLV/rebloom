# Plan: Landing page to React + Tailwind + Vite

**Spec**: .planning/specs/landing-react-migration.md
**Epic**: none
**Created**: 2026-11-01
**Status**: draft
**Risk**: medium

---

## Decisions checked against current docs and npm (2026-11-01)

| Topic | Decision | Why |
|---|---|---|
| Versions | vite 8.3.5, @vitejs/plugin-react 6.1.2, react and react-dom 19.3.1, tailwindcss 3.4.19, postcss 8.5.32, autoprefixer 10.6.2, vitest 5.0.5, jsdom 30.1.3, @testing-library/react 16.3.3, user-event 14.6.8, jest-dom 7.0.1 | Latest on npm. Exact versions pinned, no `^`. |
| TypeScript | `~6.0.3`, same as `app/` | npm latest is 7.0.2 (the new native compiler). Matching the app avoids two TS majors in one repo. |
| **Browser target** | `build.target` and `build.cssTarget` set to `['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88']` | **Vite 8's default target is Safari 16.4** ("baseline-widely-available"). Without this, the Tailwind 3.4 choice wouldn't protect old iOS. |
| Pre-render | Vite's documented SSR build: a client build of both HTML pages, then `vite build --ssr src/entry-server.tsx`, then a small Node script that puts `render(page)` into each built HTML file and deletes the server bundle | The spec says no extra framework. Two pages don't need a router. |
| Privacy page | Pre-rendered with `renderToStaticMarkup`. Its template links only the CSS (`<link rel="stylesheet" href="/src/index.css">`) and has no `<script>` | Meets the nice-to-have "no JS" for free. |
| Hydration | `index.html` wraps the page in `<div id="root">` and the client calls `hydrateRoot` | No CSS selector depends on `body >` children, so the wrapper is safe. |
| Symptoms | All 4 photos and entries always render. The inactive ones get `hidden`, decided by React state that starts at `tips` | Keeps everything in the HTML, without JS the first symptom shows, and no `:has()`. |
| Slider | The state starts at day 7 on both server and client, so there's no mismatch. An effect then moves it to day 1 and autoplays, under the same rules as today | Same as the current script. Without JS the panel shows day 7. |
| Form | Uncontrolled input with a ref. `onSubmit` calls `preventDefault`; React 19's `action` prop is not used. `inert` is passed as a boolean prop (React 19) | Keeps `checkValidity()` and the "an edit made mid-request is kept" check on the real DOM value. |
| CSS split | Layout, spacing and color use Tailwind utilities. Things utilities can't express go in `@layer components` in `src/index.css`: range-input pseudo-elements, masks, step counters, `::after` gradients, sticky plate | Fewest moving parts, while staying 1:1. |
| Exact opacities | Arbitrary opacity such as `text-surface/[.82]` | The parity spec keeps .82, .7, .78 and .65 exactly. |
| Lint | No ESLint in `landing/`: `tsc --noEmit` and the tests are the checks | Not in the spec. Add it when the landing page grows. |
| **Branch** | `feature/landing-react` from **`origin/main`**, PR into `main` | `develop` doesn't have the landing page: PR 5 merged into `main` only. Syncing `develop` with `main` is a separate chore. |

## Architecture

### Components

| Component | Type | Purpose |
|---|---|---|
| `waitlist.ts` | Module | `normalizeEmail()` (strip `\p{Cf}`, trim), `timeoutSignal(ms)` (AbortController + setTimeout), `joinWaitlist(email, source)` returning `'joined' \| 'invalid' \| 'unreachable' \| 'timeout'`, and the message strings |
| `WaitlistForm` | Component | One form, `source: 'hero' \| 'final'`. Handles busy, read-only, `aria-disabled`, `aria-invalid`, the bot trap and the status line |
| `Hero` | Component | Nav, headline, sub, form, trust line |
| `FieldNotes` | Component | Symptom radios, plate (photo and caption), entries. Holds the active-symptom state |
| `symptoms.ts` | Content | The 4 symptoms: id, label, photo, alt, plate caption, cause, natural fix, chemical fix |
| `HowItWorks` | Component | Three steps plus `RecoveryPanel` |
| `RecoveryPanel` | Component | Day 1/7 photos, slider, autoplay (IntersectionObserver plus requestAnimationFrame) |
| `OurPromise` | Component | Promise section. Not named `Promise`, which would shadow the global |
| `Final` | Component | Closing photo, form and footer |
| `LandingPage` / `PrivacyPage` | Page | Put the sections together |
| `entry-server.tsx` | SSR entry | `render(page: 'index' \| 'privacy'): string` |
| `main.tsx` | Client entry | `hydrateRoot(#root, <LandingPage />)` |
| `prerender.mjs` | Build script | Fills `<!--app-->` in `dist/index.html` and `dist/privacy.html`, then removes `dist/server` |
| `check-dist.mjs` | Build check | The spec's build checks, including the JS budget |

### File locations (all new, under `landing/`)

| File | Location | Purpose |
|---|---|---|
| `package.json`, `package-lock.json` | `landing/` | Dependencies and scripts: `dev`, `build`, `preview`, `test`, `typecheck`, `check` |
| `vite.config.ts` | `landing/` | React plugin, browser target, multi-page input, Vitest (`jsdom`, setup file) |
| `tsconfig.json` | `landing/` | Strict, `jsx: react-jsx`, `noUnusedLocals` |
| `tailwind.config.ts`, `postcss.config.js` | `landing/` | Palette F colors, fonts, `content` covers `index.html`, `privacy.html` and `src/**/*.tsx` |
| `.gitignore` | `landing/` | `node_modules`, `dist` |
| `index.html`, `privacy.html` | `landing/` (rewritten) | Templates: the `<head>` as today, `<div id="root"><!--app--></div>` |
| `index.css` | `landing/src/` | Tailwind directives, base (body, focus ring, `img { height: auto }`), components layer |
| `main.tsx`, `entry-server.tsx` | `landing/src/` | Entries |
| `waitlist.ts`, `waitlist.test.ts` | `landing/src/lib/` | Logic and unit tests |
| `symptoms.ts` | `landing/src/content/` | Field notes content |
| `WaitlistForm.tsx` and `.test.tsx`, `Hero.tsx`, `FieldNotes.tsx` and `.test.tsx`, `HowItWorks.tsx`, `RecoveryPanel.tsx` and `.test.tsx`, `OurPromise.tsx`, `Final.tsx` | `landing/src/components/` | Sections |
| `LandingPage.tsx`, `PrivacyPage.tsx` | `landing/src/pages/` | Pages |
| `setup.ts` | `landing/src/test/` | jest-dom matchers |
| `prerender.mjs`, `check-dist.mjs` | `landing/scripts/` | Build steps |

### Files to change

| File | What changes | Why |
|---|---|---|
| `landing/index.html` | 463 lines → template (head plus root placeholder) | Content moves to components |
| `landing/privacy.html` | Becomes a template with the CSS link and no script | Content moves to `PrivacyPage` |
| `landing/assets/*`, favicons, `site.webmanifest`, `apple-touch-icon.png`, `icon-*.png`, `maskable-512.png` | `git mv` into `landing/public/` | Vite serves and copies `public/` as is, so URLs don't change |
| `.claude/launch.json` | `landing` → `npm --prefix landing run preview -- --port 8766 --strictPort` (built site), plus a `landing-dev` entry (`vite`, port 5173) | The preview needs the built, pre-rendered output |

## Tasks

Every task is one commit. TDD tasks commit test and code together after red → green.

### Phase 0: Baseline (before any change)

| # | Task | Files | Test / check |
|---|---|---|---|
| 0 | Create `feature/landing-react` from `origin/main`. With the **current** page served, capture the baseline: screenshots at 375, 768, 1366×768 and 1440; measured image boxes; a no-JS screenshot. Save in the scratchpad | none (scratchpad only) | The baseline exists before any edit |

### Phase 1: Scaffold (sequential)

| # | Task | Files | Test / check |
|---|---|---|---|
| 1 | Project config and dependency install (exact versions) | `package.json`, `vite.config.ts`, `tsconfig.json` | `npm ls` clean, no peer warnings between Vite 8 and Vitest 5 |
| 2 | Tailwind setup with Palette F colors and fonts, base and components CSS ported from today's `<style>` blocks | `tailwind.config.ts`, `postcss.config.js`, `src/index.css` | No hex values outside `tailwind.config.ts` (grep) |
| 3 | Move static files to `public/`, add `.gitignore` | `git mv` (mechanical), `.gitignore` | `git status` shows renames only |

### Phase 2: Logic and interactive components, TDD (depends on Phase 1)

| # | Task | Files | Test / check |
|---|---|---|---|
| 4 | `waitlist.ts`: write `waitlist.test.ts` first (red), then the module | `src/lib/waitlist.ts`, `src/lib/waitlist.test.ts`, `src/test/setup.ts` | Unit tests below go red, then green |
| 5 | `WaitlistForm`: tests first | `src/components/WaitlistForm.tsx`, `.test.tsx` | Component tests below |
| 6 | `RecoveryPanel`: tests first | `src/components/RecoveryPanel.tsx`, `.test.tsx` | Component tests below |
| 7 | `FieldNotes` and its content: tests first | `src/components/FieldNotes.tsx`, `.test.tsx`, `src/content/symptoms.ts` | Component tests below |

### Phase 3: Static sections and pages (depends on Phase 2 for the form and panel)

| # | Task | Files | Test / check |
|---|---|---|---|
| 8 | Hero and How it works | `src/components/Hero.tsx`, `src/components/HowItWorks.tsx` | Typecheck |
| 9 | Promise and final section | `src/components/OurPromise.tsx`, `src/components/Final.tsx` | Typecheck |
| 10 | Pages. The privacy GDPR TODO becomes a code comment (React can't output HTML comments) | `src/pages/LandingPage.tsx`, `src/pages/PrivacyPage.tsx` | Typecheck |

### Phase 4: Pre-render and build (depends on Phase 3)

| # | Task | Files | Test / check |
|---|---|---|---|
| 11 | Templates and entries | `index.html`, `privacy.html`, `src/main.tsx` (+ `src/entry-server.tsx`) | `npm run dev` renders both pages |
| 12 | Pre-render script and `build` wiring (`tsc --noEmit && vite build && vite build --ssr src/entry-server.tsx --outDir dist/server && node scripts/prerender.mjs`) | `scripts/prerender.mjs`, `package.json` | `dist/*.html` contain the content |
| 13 | Build checks, run by `npm run check` | `scripts/check-dist.mjs`, `package.json` | The build checks below. Red if the JS budget fails |
| 14 | Launch config | `.claude/launch.json` | The preview opens the built site on 8766 |

### Phase 5: Verify and break-test (depends on Phase 4)

| # | Task | Files | Test / check |
|---|---|---|---|
| 15 | Full green run: `typecheck`, `test`, `build`, `check`, `node --test "supabase/tests/*.test.mjs"` | none | All pass |
| 16 | Browser parity against the baseline: 4 widths, measured image boxes, no horizontal scroll at 375, console clean (no hydration warnings), no-JS render and POST, a real sign-up with an `example.com` address returning 204, a reduced-motion check | Device checklist for real iOS 14/15 in-app browsers in `.handoff/` | Side-by-side with the baseline |
| 17 | Break-test report (review.md, medium risk). Report only, no fixes | none | Numbered list, worst first |

### Parallel vs sequential

| Parallel group | Tasks | Why |
|---|---|---|
| A | 4, 6, 7 | Independent files and logic |
| B | 8, 9 | Independent static sections |

| Sequential | Depends on | Why |
|---|---|---|
| 1 → 2 → 3 | the previous task | Config before CSS before the file moves |
| 5 | 4 | The form uses `waitlist.ts` |
| 8 | 5, 6 | Hero uses the form; How it works uses the panel |
| 10 | 7, 8, 9 | Puts the sections together |
| 11 → 12 → 13 | the previous task | Entries before pre-render before checks |
| 15–17 | 14 | Needs the finished build |

In practice I'll run these one after another in this session. The parallel groups are small, so separate sessions would cost more than they save.

## Testing plan (spec → test)

| Spec item | Test | Type |
|---|---|---|
| Strip `\p{Cf}`, then trim | `normalizeEmail(' ' + ZWSP + 'a@b.co ')` (ZWSP = U+200B) gives `'a@b.co'`; invisible characters only gives `''` | Unit |
| 204/400/other/network | Mocked `fetch` returns 204, 400, 500, or rejects with a `TypeError` → `joined`, `invalid`, `unreachable`, `unreachable` | Unit |
| Timeout without `AbortSignal.timeout` | `AbortSignal.timeout` deleted, fake timers, a fetch that never resolves → `timeout` after 25 s | Unit |
| Request shape | Body is `{ p_email, p_source }`, `apikey` header set, POST to the RPC URL | Unit |
| Double submit (edge 4) | Two quick submits → `fetch` called once | Component |
| Busy state and focus (edge 4) | During the request the input is `readOnly`, the button has `aria-disabled="true"` and isn't `disabled`, and focus stays on the button | Component |
| Edit mid-request (edge 4) | Change the value before 204 → the value is kept and the joined message shows | Component |
| Bot trap (edge 4) | `rb_hp` filled → no `fetch`, joined message | Component |
| Invalid email | Bad value → `aria-invalid="true"`, input focused, `aria-describedby` points at the status; typing clears `aria-invalid` | Component |
| `source` prop | The hero form sends `hero`, the final form sends `final` | Component |
| Symptoms (edge 1) | First render shows only `tips`; picking each radio shows only its photo, caption and entry | Component |
| Recovery (edge 8) | Reduced motion → day 7, no observer; no `IntersectionObserver` → day 7; a drag before intersection → no autoplay; `aria-valuetext` updates | Component |
| No-JS HTML (edge 1) | `dist/index.html`: headline, 4 entries, 2 `<form method="post">`, slider `value="7"` | Build check |
| `:has()` (edge 5) | No `:has(` in the built CSS | Build check |
| Old-browser output (edge 5) | No CSS nesting and no `@layer` in the output CSS, JS syntax at most ES2020 | Build check plus the device checklist |
| Paths (edge 6) | Every `src`, `href` and `content` URL in both pages (icons, manifest, OG, `privacy.html`) resolves to a file in `dist/` | Build check |
| Bundle (edge 3) | Gzipped JS loaded by `index.html` ≤ 70 KB; `privacy.html` has no `<script>` | Build check |
| Hydration (edge 2) | No React hydration warnings in the console on load, at all 4 widths | Browser |
| Tailwind drift (edge 7) | Image boxes at 1366×768 match the baseline: steps 369×369, plate 476×595, promise 458×572; screenshots match | Browser |
| API unchanged | `supabase/tests` pass; a real `example.com` sign-up returns 204 | Integration |
| No data or API changes | Nothing to test at the data layer: the spec makes no data or API changes | (n/a) |

## Risks for the build

- **The pre-rendered `<head>` must match exactly.** Vite rewrites asset URLs in templates. `check-dist` compares the head tags with the list in the spec.
- **React 19 hydration with `inert`, `readOnly` and the range `value`:** a mismatch shows as a console warning. Covered by test 16.
- **Budget risk:** React 19 plus react-dom gzipped is close to 60 KB. If the total goes over 70 KB, I'll report it and won't quietly raise the limit.
