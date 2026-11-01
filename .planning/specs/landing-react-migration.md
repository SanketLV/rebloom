# Spec: Landing page to React + Tailwind + Vite

**Created**: 2026-11-01
**Status**: draft
**Author**: Sanket
**Epic**: none
**Risk**: medium (the waitlist form can stop working; nothing stored server-side changes)

---

## Problem

The landing page is one hand-written `landing/index.html` (463 lines of inline CSS, markup and DOM scripts) plus `privacy.html`. It is getting hard to edit safely, more pages are planned (they would mean copying HTML between files), it doesn't match the React + TypeScript stack of the app, and richer interactive sections are painful to build with plain DOM scripts.

## Goal

`landing/` is a Vite + React + TypeScript + Tailwind project. `npm run build` outputs fully pre-rendered static HTML for `index.html` and `privacy.html` into `landing/dist/`. For visitors nothing changes: same look at every breakpoint, the page still works without JavaScript, and the waitlist behaves exactly as it does today.

## User Stories

- As a **visitor arriving from an Instagram or TikTok in-app browser on a slow phone**, I want the page to show up fast and the waitlist form to work even if scripts load late or fail, so I can join in one try.
- As the **developer**, I want the page split into typed React components styled with Tailwind on the Palette F tokens, so I can change a section or add a page without editing one giant file.

## Requirements

### Must-have

**Project**
- `landing/` becomes a Vite project: React 19, TypeScript, **Tailwind CSS 3.4** (v4 needs Safari 16.4+, and the page currently supports much older iOS), npm (same as `app/`).
- Static files keep their URLs: `assets/*`, favicons, `site.webmanifest`, `apple-touch-icon.png`, icons and `og.png` move to `landing/public/`.
- Scripts: `dev`, `build` (typecheck + client build + pre-render), `preview`, `test` (Vitest).
- `.claude/launch.json` `landing` entry serves the new site.

**Pre-rendering**
- The build renders each page to complete HTML with `react-dom/server`, following Vite's SSR/pre-render guide. No extra framework.
- All text, images and both forms are in the shipped HTML. The client calls `hydrateRoot`, with no hydration warnings.
- `<head>` is identical to today: title, description, OG/Twitter tags, icons, manifest, `theme-color`, the Google Fonts link and the 3 preconnects.

**Visual parity (1:1)**
- Same sections, copy, photos, alt text and layout at 375, 768, 1366×768 and 1440.
- Keep the measured sizes at 1366×768: step photos 369×369, field-notes photo 476×595, promise photo 458×572, the How it works row ending inside the viewport.
- Palette F lives in `tailwind.config` as theme colors. Components use no raw hex values or arbitrary colors.
- Same fonts (Instrument Serif and Figtree from Google Fonts), the same fluid `clamp()` sizes, and the same focus rings.

**Components**
- `WaitlistForm` (used twice, with a `source` prop of `hero` or `final`), `Hero`, `FieldNotes`, `HowItWorks` with `RecoveryPanel`, `Promise`, `Final` with the footer, and `PrivacyPage`.
- Waitlist request logic lives in a plain TypeScript module (`waitlist.ts`) that can be tested without React.

**Behavior kept exactly**
- Waitlist: strips `\p{Cf}`, then trims, then validates with the browser's email check. Repeat submits are ignored while busy. The input is read-only and the button `aria-disabled` (not `disabled`) while sending. `aria-invalid` plus `aria-describedby` on errors. Bot trap `rb_hp` inside an `inert` wrapper. 25 s timeout built with `AbortController` + `setTimeout` (no `AbortSignal.timeout`). 204 clears the field only if it still holds what was sent. 400 means invalid. Anything else shows "Couldn't reach". A timeout shows "joining twice is safe". The email is kept after a failure. Status messages use the same wording.
- Without JavaScript: the forms keep `method="post"`, the first symptom shows, and the slider shows day 7.
- Field notes: switching symptoms swaps photo, caption and entry, without `:has()`. The pre-rendered default is "tips".
- Day 1 → 7: autoplays once at 60% visibility over 2.8 s with cubic ease-out. No autoplay with reduced motion or without `IntersectionObserver` (show day 7). A drag before or during the autoplay stops it. Keeps `aria-valuetext`.

**Budget**
- JavaScript for `index.html` stays at or under 70 KB gzipped. Photos are unchanged.

### Nice-to-have
- `privacy.html` ships with no JavaScript (it has nothing interactive).
- Unchanged sections stay pixel-identical in a screenshot diff.

### Out of scope
- Any visual or copy change, or redesign.
- New pages (blog, FAQ, guides).
- Backend changes: Supabase, `join_waitlist()`, migrations, keep-alive job.
- Sharing tokens or components with `app/`, or a monorepo or workspace setup.
- Hosting and deploy setup, self-hosting the fonts, and the deferred waitlist findings 11–17.

## Data Model

None.

## API Changes

None. The form keeps calling `POST /rest/v1/rpc/join_waitlist` with `{ p_email, p_source }` and the publishable key, as today.

## UI Changes

None visible. Every section is rebuilt as a component with the same output.

## Edge Cases

1. **JavaScript fails or is slow:** the pre-rendered page must be complete and readable, and the form must submit by POST (never GET with the email in the URL).
2. **Hydration mismatch:** the server and client markup differ (for example the slider's start value or the active symptom), causing a flicker or React replacing the DOM.
3. **Bundle bloat:** React plus app code makes first load slower in in-app browsers on 3G.
4. **Waitlist regression:** any of the kept behaviors above gets lost in the rewrite: a double submit sending 2 requests, an edit made mid-request getting wiped, focus lost when busy, or the bot trap sending.
5. **Old browsers:** an iOS 14–15 in-app browser must still render Tailwind styles, switch symptoms and run the slider.
6. **Broken paths:** images, favicons, manifest, OG image or the `privacy.html` link 404 after the move to `public/` and `dist/`.
7. **Tailwind drift:** Tailwind's default spacing, line-height or preflight reset quietly changes the layout (for example the `img { height: auto }` fix, or the list and heading resets).
8. **Reduced motion and no `IntersectionObserver`:** the slider must still land on day 7 and never get stuck on day 1.

## Testing Criteria

**Unit (Vitest)**
- `waitlist.ts`: invisible characters stripped and trimmed. 204 means joined, 400 means invalid, 500 and network errors mean unreachable, abort means timeout. The timeout works when `AbortSignal.timeout` is missing.

**Component (Vitest + Testing Library)**
- `WaitlistForm`:
  - a double submit sends 1 request
  - read-only and `aria-disabled` while busy
  - an edit made mid-request is kept after 204
  - a filled bot trap sends nothing and shows success
  - an invalid email sets `aria-invalid` and keeps focus
  - the `source` prop reaches the request
- `FieldNotes`: picking each symptom shows only its photo, caption and entry.
- `RecoveryPanel`:
  - reduced motion shows day 7
  - no `IntersectionObserver` shows day 7
  - a drag before autoplay prevents autoplay

**Build checks**
- `dist/index.html` contains the headline, all 4 symptom entries and 2 forms with `method="post"`.
- No `:has(` anywhere in the CSS.
- `dist/privacy.html` exists, and every `src`/`href` in both pages resolves to a file in `dist/`.
- The JS budget holds.

**Integration**
- `node --test "supabase/tests/*.test.mjs"` still passes.
- A real browser sign-up with an `example.com` address gets 204 and shows the joined message (the server never stores it).

**Browser (built site)**
- At 375, 768, 1366×768 and 1440: matches the current page, no horizontal scroll at 375, no console errors, no hydration warnings.
- With JavaScript disabled: full page renders and the form posts without the email in the URL.

**Break-test** after green (review.md, medium risk), reported before any fix.

## Dependencies

- Node 24 and npm (installed).
- Vite, React 19, react-dom, TypeScript, Tailwind CSS 3.4, PostCSS, Autoprefixer, Vitest, Testing Library, jsdom. Exact versions are picked at plan time from current docs.
- The existing Supabase project and `join_waitlist()`, unchanged.
- The current `landing/index.html` and `privacy.html` as the reference for parity screenshots, captured before the rewrite.
