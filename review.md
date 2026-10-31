# Review rules

How every change to Rebloom gets reviewed, by `/code-review`, `/spartan:gate-review`, a reviewer agent or a person. Loaded from `CLAUDE.md`.

## 1. Rate the risk first

Before writing a spec or reviewing a change, answer one question: **what happens to a user if this breaks?**

| Risk | What breaks | Examples in Rebloom | Process |
|---|---|---|---|
| **Low** | Something looks wrong | Spacing, copy, colors, icons, empty-state art | Typecheck, lint, unit tests, one review pass. No break-test or fuzz tests. |
| **Medium** | A feature stops working, nothing is lost | Scan flow step, tab navigation, plant list sorting, notifications | Above + integration tests + break-test report (global `CLAUDE.md` §3a.3). |
| **High** | Data lost, user locked out, money taken, or someone else's data shown | Local DB migrations, deleting plants/photos/scans, Supabase auth, RLS policies, sync, payments/subscriptions, backups | Above + property tests (fast-check) + adversarial swarm offered + a person reads the diff. |

Write the rating in the spec's header (`Risk: low | medium | high`). If a change touches several areas, the highest one wins. When unsure, go one level up.

## 2. What counts as a real failure

Report these:
- A requirement or eval from the spec isn't met.
- Data can be lost, duplicated or orphaned (DB rows, photo files).
- A crash, an endless spinner, or a screen with no way out (including Android Back).
- Wrong advice shown as confident (diagnosis confidence must never go up on weak input).
- Accessibility: missing labels, touch targets under 44px, screen readers not told about progress.
- Security: secrets in code, Supabase tables without RLS, user input reaching SQL unescaped, photo metadata (GPS) leaking.
- Hex colors outside `src/theme/tokens.ts`, or Expo APIs used from memory instead of the SDK 58 docs.

Severity: **Critical** (data loss, security, crash on the main flow) → **High** (feature broken) → **Medium** (works, but wrong in an edge case) → **Low** (polish).

## 3. What to ignore

- Style that Prettier or ESLint already handles.
- "Could be more abstract" suggestions with no bug behind them.
- Deferred items already recorded in a handoff or spec as YAGNI.
- Device-only checks: add them to the device checklist in `.handoff/` instead of blocking the review.

## 4. How to report

Numbered list, worst first. For each item: file:line, what breaks, how to reproduce it, severity, suggested fix.
Name the **kind** of problem (e.g. "unnormalized user text", "missing cleanup on failure") so the fix covers every place it appears, not just the one found.

## 5. Loop limits

- Round 1 reviews the whole change. Later rounds only review what the last fixes changed and never repeat an earlier finding.
- If the same finding survives 2 rounds of fixes, stop patching: rethink the approach and tell the user.
- Hard stop after 3 rounds. Report what's left and let the user decide.

## 6. Rules learned over time

Add a one-line rule here when a bug got past review, or when the review kept flagging something that wasn't a problem. Only add a rule after the user approves it. Format: `- Rule. (where it came from, date)`

- Normalize user text before validating or comparing: strip invisible characters (`\p{Cf}`), trim, and compare case- and accent-insensitively. (scan-diagnosis #11, #12, 2026-10-26)
- Every file the app writes needs an owner in the DB and a cleanup path for crashes; check for orphans. (scan-diagnosis #14, 2026-10-26)
- Combining signals must never raise confidence above the weakest input's flag. (scan-diagnosis #2, 2026-10-26)
- Progress that's only shown visually must also be announced to screen readers on iOS. (scan-diagnosis #17, 2026-10-26)
