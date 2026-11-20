# Screen Design: Kindwise diagnosis

**Date**: 2026-11-20
**Status**: approved
**Designer**: Claude (main agent)
**Critic**: design-critic agent
**Verdict**: PASSED (round 2)
**AI Assets**: none. No new images; the user's own photo is the only picture.

**Spec**: `.planning/specs/kindwise-diagnosis.md`
**Tokens**: `app/src/theme/tokens.ts` (no `.planning/design-config.md`; tokens and Notion "Brand & Design" are the source). Every value below is a token name; no new colors, fonts or spacing.
**Canvas**: "Rebloom App Screens", row **G · Real diagnosis (Kindwise)** (https://claude.ai/artifact/1ief2yordgFEYCVaYV41qW): 9 artboards `Kw*.dc.html`. The offline artboard has a `variant` tweak for offline / server / busy.
**Existing components reused**: `Button`, `TextButton`, `Chip`, `ConfidenceBar`, `BottomSheet`, `ErrorState` layout, `SaveSheet`, `Toast` (new in PR #30).

Phone only, portrait locked: the 768 and 1440 breakpoints don't apply. Sizes checked: 375×667 (iPhone SE), 360×800, 390×844, 430×932, plus 200% text on the smallest.

---

## Screen Inventory

| # | Screen | Change | States | Priority |
|---|---|---|---|---|
| 1 | Analyzing | real wait, "still checking" line | checking, slow (>8 s) | must |
| 2 | Kindwise question | new step before our Questions | default, answered | must |
| 3 | Result | species line, Kindwise names, honest photo chip | confident, not sure, unmapped disease, long names | must |
| 4 | Result: healthy | new state | healthy, healthy but not sure | must |
| 5 | Not a plant | new full screen | default | must |
| 6 | Can't reach diagnosis | ErrorState copy | offline / timeout, server failed, busy today | must |
| 7 | Out of free scans | new full screen | default | must |
| 8 | Save sheet | name pre-filled | pre-filled, user edits | must |
| 9 | My Plants row | unfinished scan | finishing, needs retry | must |
| 10 | Scans left | one quiet line on Result | 2 left, 1 left, last one used | nice |

No new loading or empty screens: Analyzing is the loading state, and My Plants' empty state is unchanged.

---

## 1. Analyzing

Layout unchanged (photo, 3 step rows). Two copy changes, because the wait is now real and the photo leaves the phone:

| Step | Before | After |
|---|---|---|
| 1 | Photo ready | Photo ready |
| 2 | Checking color, spots and edges | Sending to our diagnosis service |
| 3 | Comparing likely causes | Comparing likely causes |

- **Photo pill:** "Analyzing on your phone" → "Checking your photo". **Footer:** "Your photo stays on your phone" → "An automated check. Your photo is sent without its location, and our diagnosis partner deletes its copy once you have the result." (no lock icon) Both old lines are false once the photo is sent.
- **Slow (> 8 s):** a `type.small` line in `colors.textSecondary` appears under the steps: "Still checking. This can take up to 20 seconds." Announced once to screen readers (`announceForAccessibility`, review.md rule for visual-only progress).
- **Cancel:** the existing close button stays. Closing mid-call keeps the scan `pending` (spec edge case 8), no message.
- "Our diagnosis service", never "expert": it must not imply a person. The vendor is named on the privacy page.

## 2. Kindwise question (new step)

Same layout and components as the Questions artboard, so it reads as one more question, not a new feature.

```
+----------------------------------+
| <  Back                  1 of 4  |
|                                  |
| Is the soil still wet            |   type.title, colors.text
| a day after watering?            |
|                                  |
| [ Yes                         ]  |   option rows, same as Questions
| [ No                          ]  |
| [ I'm not sure                ]  |
|                                  |
| [          Next             ]    |   Button (primary), disabled until picked
+----------------------------------+
```

- Progress reads "1 of 4" when Kindwise sent a question, "1 of 3" (as today) when it didn't.
- No explanatory hint under the question: Kindwise's questions vary, so a fixed hint could be false.
- Kindwise text shown as plain text; long questions wrap, never truncate.
- Back on step 1 goes to the camera, same as today.
- "I'm not sure" changes nothing (same rule as our questions).

## 3. Result

```
+----------------------------------+
| <        Diagnosis         [save]|
| +------------------------------+ |
| |          your photo          | |
| | (Saved on your phone only)   | |   photo chip, see below
| +------------------------------+ |
| +--- card (colors.surface) ----+ |
| | MONSTERA DELICIOSA           | |   type.label, colors.textSecondary, species line
| | Swiss cheese plant ·         | |
| |   species match 91%          | |   type.small
| |                              | |
| | MOST LIKELY                  | |   type.label
| | Overwatering      [Moderate] | |   type.title + severity pill (mapped only)
| | Roots stressed by soggy soil | |   type.body, colors.textSecondary
| | [========-----]  64%         | |   ConfidenceBar
| |                              | |
| | Other possibilities          | |
| | Root rot (early)        21%  | |
| | Fungal leaf spot         9%  | |   unmapped Kindwise name, sentence case
| +------------------------------+ |
| Based on your answers  Doesn't.. |
| (chip) (chip) (chip)             |
| 2 free scans left this month     |   nice-to-have, type.small, textSecondary
|----------------------------------|
| [     See treatment plan      ]  |
|          Retake photo            |
+----------------------------------+
```

- **Species line** sits above the diagnosis, small, because the plant's problem is what the user came for. Scientific name in `type.label` caps style; first common name and "species match NN%" in `type.small`, labelled so it isn't read as the diagnosis confidence; the bar is labelled "Diagnosis confidence". Species below 0.30: "Species not sure" instead of a name, no percentage.
- **Photo chip:** "Scanned on your phone" is now false and must go. New copy: "Saved on your phone only" (true once the partner's copy is deleted). Same chip style.
- **One privacy wording everywhere:** the phone copy is "saved on your phone"; the sent copy is "our diagnosis partner deletes its copy once you have the result". Must match what the server really does (spec: delete the Kindwise identification after fetching; verify in the plan).
- **Mapped conditions** (our 7) keep their name, subtitle and severity pill. **Unmapped Kindwise diseases** show Kindwise's name in sentence case, Kindwise's first description sentence as the subtitle, and **no severity pill** (we don't invent a severity we don't have).
- **Not sure** (top < 0.50): the existing "We're not sure yet" box; Retake becomes primary and "See treatment plan anyway" secondary, as today.
- **No "Demo" tag** for `kindwise-v1`. Old fake scans keep theirs.
- **Long names** (e.g. "Pseudomonas syringae pv. tomato"): wrap to 2 lines, then end with an ellipsis; the full name is the `accessibilityLabel`.

## 4. Result: healthy

```
| MONSTERA DELICIOSA               |
| Swiss cheese plant · 91%         |
|                                  |
| Looks healthy           [Healthy]|   pill: colors.healthy on colors.healthyBg
| No signs of disease or pests in  |
| this photo.                      |
| [===========--]  88%             |
|----------------------------------|
| [      Save to My Plants      ]  |   primary; no treatment button
|          Scan another            |
```

- Healthy but unsure (`is_healthy` probability < 0.50): the "We're not sure yet" box stays on top; copy "Looks healthy, but the photo isn't clear enough to be sure."
- The severity color is never the only signal: the pill also says "Healthy" in text.

## 5. Not a plant

Full screen, `ErrorState` layout (centered, `colors.bg`), the user's photo as a 96 px rounded thumbnail (`radius.md`) above the title so they see what was checked.

- Title: "This doesn't look like a plant"
- Body: "Try again with a leaf filling most of the photo. This didn't use a free scan."
- Primary: "Retake photo". Secondary: "Photo tips" (opens the existing TipsSheet).

## 6. Can't reach diagnosis (ErrorState copy)

| Case | Title | Body | Primary | Secondary |
|---|---|---|---|---|
| Offline / timeout | "Can't diagnose without internet" | "Your photo is saved on your phone. Connect and try again. This didn't use a free scan." | Try again | Scan later |
| Server failed (`502`) | "We couldn't check this photo" | "Something went wrong on our side. Your photo is saved on your phone. This didn't use a free scan." | Try again | Scan later |
| Busy today (`503`) | "Diagnosis is busy today" | "Lots of people are scanning. Try again tomorrow. This didn't use a free scan." | Done | none |
| Still running (`202`, or the app's 20 s ran out) | "Still checking your photo" | "This is taking longer than usual. Your photo is saved on your phone, and the answer will wait for you in My Plants." | Try again | Scan later |

The last row was added in the build: Kindwise may already have counted the scan, so "This didn't use a free scan" would be false there (plan D2).

Review round 1 (build): "This didn't use a free scan" now shows only where the server said so (502, busy, not a plant). Offline drops it (the connection can fail after the server started), and any other server error shows "We couldn't check this photo" / "Something went wrong on our side. Your photo is saved on your phone." without it.

**No clear problem** (Kindwise saw a plant but named nothing we show): ErrorState layout with the photo thumbnail, "We couldn't find a clear problem" / "Nothing in this photo points to a clear problem. A close photo of the leaf that looks wrong may help.", Retake photo (primary), Done.

- "Scan later" closes the scan and keeps it `pending` in My Plants (row 9).
- "This didn't use a free scan" is repeated on purpose: the fear after an error is "did that cost me one?".

## 7. Out of free scans

```
+----------------------------------+
|                               X  |
|                                  |
|        (thumbnail of photo)      |
|                                  |
|  You've used your 3 free scans   |   type.title, centered
|  this month                      |
|                                  |
|  They reset on 1 December.       |   type.body, local date format
|  Your photo is saved on your     |
|  phone, so you can check it then.|
|                                  |
|  [            Done            ]  |   primary
+----------------------------------+
```

- No upsell and no fake "Go premium" button: payments are a later spec.
- The date uses `Intl.DateTimeFormat` with the device locale (UTC `resets_at` → local).
- The scan is kept `pending` so it can be finished after the reset.

## 8. Save sheet

- Name field pre-filled with the first common name ("Swiss cheese plant"); scientific name if there's no common name; the existing default ("My plant") if species is unsure (build: kept the current default rather than an empty field that blocks Save). Text is selected on focus so one tap replaces it.
- Everything else unchanged.

## 9. My Plants row: unfinished scan

| State | Row secondary line | Tap |
|---|---|---|
| finishing (app fetches the result) | "Finishing diagnosis…" with a small `ActivityIndicator` | no-op |
| ready (result fetched, not saved) | "Diagnosis ready · See result" | opens the scan at its questions, then Result (plan D6) |
| needs retry (server had nothing) | "Diagnosis didn't finish · Try again" in `colors.warning` | re-runs the diagnosis with the saved photo |

| other account (sent with an account that isn't signed in now) | "Scanned with another account: switch back to finish it" | no-op (re-sending would count it twice) |

Row title: "Scan from <date>" (no plant name yet). A scan opened from My Plants isn't removed when it's closed without saving (review round 1). Rows sit above the plants. Added in the build (plan D6): a scan finished in the background needed somewhere to go.

Text, not color alone, carries the state.

## 10. Scans left (nice-to-have)

One `type.small` line under the answer chips: "2 free scans left this month", "1 free scan left this month", "That was your last free scan this month". Hidden when the server didn't send `scans_left`.

---

## Motion Plan

| Element | Animation | Trigger | Duration | Easing |
|---|---|---|---|---|
| "Still checking" line | fade in | 8 s into Analyzing | 200 ms | ease-out |
| Kindwise question | same screen transition as Questions | push | native stack default | native |
| Error / quota / not-a-plant screens | replace Analyzing, no extra motion | result | native | native |

**Reduced motion:** the fade becomes an instant show (`useReduceMotion`, already in the app).

## Accessibility

- [x] Contrast: all text uses existing token pairs already checked on the scan screens (`colors.text` / `colors.textSecondary` on `colors.bg` and `colors.surface`; severity pairs). New warning line uses `colors.warning` on `colors.bg` (≥ 4.5:1, same pair as severity pills).
- [x] Touch targets: all buttons are `Button` (56 pt) or `TextButton` (≥ 44 pt). Kindwise question options reuse the Questions option rows (≥ 44 pt).
- [x] Screen readers: "Still checking" announced once; the Kindwise question's title is a header; species line reads as "Monstera deliciosa, Swiss cheese plant, 91 percent likely"; truncated names have the full name as label.
- [x] Color never the only signal: severity and healthy pills carry text; pending rows carry text.
- [x] Reduced motion respected.
- [x] 200% text at 375×667: Result and error screens scroll; the bottom buttons stay reachable (existing pattern).
- [x] Android Back on every new screen: question → previous step; error / quota / not-a-plant → camera.

## Self-check

1. Real app, not a template: reuses the existing scan artboards; no new card styles, no gradients, no icons added for decoration.
2. Hierarchy: the diagnosis stays the biggest thing; species is a small line above it.
3. Accent: `colors.primary` only on the primary button per screen.
4. Copy is specific and honest: names the reset date, says when a scan wasn't used, never upsells.
5. All states covered: confident, not sure, unmapped, long names, healthy, healthy-unsure, not a plant, offline, server failed, busy, quota, pending, retry.
6. The false "Scanned on your phone" chip is replaced.

## Design Gate log

- **Round 1 (NEEDS CHANGES, 8 items):** privacy wording made consistent and located (phone vs partner); "expert" → "diagnosis service"; species % labelled "species match", bar labelled "Diagnosis confidence"; missing states drawn as canvas tweaks (`KwResult` state: confident / notSure / unmapped / longName / speciesUnsure, scansLeft 2 / 1 / 0 / hidden; `KwHealthy` healthy / healthyUnsure; `KwAnalyzing` slow on/off); fixed hint under the Kindwise question removed; type snapped to tokens (titles 28/32, body 16, chip 13); mock-photo colors marked as not UI; lock icon removed.
- **Round 2 (ACCEPT):** all 8 resolved. Nit fixed: artboard and page title "Plant expert's question" renamed "Diagnosis question".
