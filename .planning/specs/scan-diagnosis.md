# Spec: Scan → Diagnosis

**Created**: 2026-10-24
**Status**: draft
**Author**: Sanket
**Epic**: none

**Sources**: Notion "AI Plant Doctor App" → Screens & User Flow (B. Diagnose), Tech Stack (diagnosis model decision, Oct 19), Features & MVP Scope · Design canvas "Rebloom App Screens" (https://claude.ai/artifact/1ief2yordgFEYCVaYV41qW), artboards Camera, PermissionSheet, RetakeSheet, Analyzing, Questions, Result, SaveSheet, FeedbackSheet, ErrorState, MyPlants, EmptyPlants

---

## Problem

The Scan button opens an empty placeholder, so the core loop of the app (photo → diagnosis) doesn't exist yet. The people Rebloom is for have a sick plant and have been burned by apps that give one confident, wrong answer. They need a quick photo flow that is honest about uncertainty, asks a few questions before deciding, and keeps the result. The on-device model that will do the real diagnosing isn't trained or converted yet (roadmap tasks not started), so the flow can't wait for it.

## Goal

From the Scan button, a user can take or pick a photo, answer 3 follow-up questions, and see a ranked diagnosis (top 3 with confidence) that their answers changed. They can save the plant (it shows up in My Plants) and say whether the diagnosis was right. Diagnosis runs behind a `Diagnoser` interface. A fake implementation fills it for now, and every fake result is clearly labelled "Demo diagnosis". The real model later replaces the fake without changing any screen. Everything works offline, nothing leaves the phone, and `typecheck`, `lint` and `test` pass.

## User Stories

- As a **plant owner with a sick plant**, I want to snap a photo and answer a few quick questions, so I get a diagnosis that considers how I actually care for the plant, not just a guess from the picture.
- As a **plant owner**, I want the app to say when it isn't sure and ask for a better photo, so I don't act on a confident wrong answer.
- As a **plant owner**, I want to save the plant after a scan, so I can find it again in My Plants.
- As a **plant owner**, I want to say whether a diagnosis was right, so the app can get more accurate.
- As the **developer**, I want the diagnosis engine behind one interface, so I can drop in the on-device model later without touching the UI.

## Requirements

### Must-have

**Diagnosis engine** (`app/src/diagnosis/`)
- `Diagnoser` interface: `diagnose(photo: { uri, width, height, sizeBytes }) → Promise<Diagnosis>` (the prepared 800px photo), where `Diagnosis` is the top 3 candidates `{ conditionId, confidence }` with confidences between 0 and 1 (sum ≤ 1), plus the `diagnoserId` (e.g. `fake-v1`).
- Condition catalogue: `conditionId`, display name, one-line subtitle, severity (`mild | moderate | severe`). At least: Overwatering, Root rot (early), Underwatering, Not enough light, Sunburn, Spider mites, Healthy / nothing wrong.
- **Fake diagnoser**: deterministic (the same prepared-photo width, height and `sizeBytes` always give the same result; the uri/filename has no effect), realistic top 3, and about 1 in 4 photos come out low-confidence so that path gets exercised. Tests can inject a fixed result.
- **Re-ranking by answers**: a pure function `applyAnswers(diagnosis, answers) → diagnosis` boosts or lowers candidates using simple rules, then re-normalizes:

  | Answer | Boosts | Lowers |
  |---|---|---|
  | Water every 2–3 days | Overwatering, Root rot | Underwatering |
  | Every 2 weeks or less | Underwatering | Overwatering, Root rot |
  | Direct sun for hours | Sunburn | Not enough light |
  | Low light, dark corner | Not enough light | Sunburn |
  | Repotted it | Root rot | — |
  | Moved it to a new spot | Sunburn, Not enough light | — |
  | "I'm not sure" / any other answer | — | — |

  Rule weights live in one table in code. Answers never add a condition that wasn't in the top 3.
- **Low-confidence threshold**: top-1 confidence < 0.50.

**Scan flow** (inside the existing `scan` full-screen modal)
1. **Camera permission sheet** (artboard PermissionSheet), shown the first time. "Allow camera" → system prompt. "Choose a photo instead" → gallery. If permission is permanently denied, the sheet offers "Open Settings" plus the gallery. Copy change: drop "A photo is only sent for a closer look when the app is unsure" (nothing is sent now). Keep "Scans run on your phone."
2. **Camera** (artboard Camera): live preview, framing corners in `reward`, the "Fill the frame with the sick leaf" chip, close (X), shutter, gallery button, photo tips (?) button and "Runs on your phone · works offline". The flash toggle and the "Leaf found · hold steady" chip are left out (see Out of scope).
3. **Photo tips sheet** (the tips list from RetakeSheet, with title "Tips for a good scan" and one "Got it" button).
4. **Prepare photo**: resize to 800px on the longest side (never upscale), JPEG, orientation corrected (`expo-image-manipulator`). The re-encode drops EXIF (including GPS). After a successful resize, the source file (the camera's full-size capture or the picker's cache copy) is deleted if it's inside the app cache. Nothing outside the app cache is ever deleted.
5. **Analyzing** (artboard Analyzing): the photo with the scan line, and three steps that tick through: "Photo ready" → "Checking color, spots and edges" → "Comparing likely causes". Shown for at least 1.2s so the steps can be read. Copy change: no species line ("likely a Monstera"), because the app doesn't identify species. "Your photo stays on your phone" stays. A small "Demo" tag shows while the fake is active.
6. **Low-confidence sheet** (artboard RetakeSheet), when top-1 < 0.50. Title "We couldn't get a clear read" (not "blurry", since blur isn't detected), the 3 tips, "Retake photo" → Camera, "Use it anyway" → Questions.
7. **Follow-up questions** (artboard Questions): 3 questions, one per step, progress bar "N of 3", one answer per question, "I'm not sure" (counts as an answer and moves on), Continue / "See my diagnosis", back between steps. The questions and options are exactly as on the artboard. The header card shows the top two candidate names ("Overwatering or root rot?") and a small "Demo" tag while the fake is active.
8. **Result** (artboard Result): photo, "Most likely" name + severity chip, confidence bar + %, "Other possibilities" with %, "Based on your answers" chips, "Doesn't look right?", "See treatment plan", "Retake photo", bookmark (Save). A **"Demo diagnosis" badge** is visible while the fake diagnoser is active.
   - Low-confidence variant (final top-1 still < 0.50): a "We're not sure yet" note above the result, and "Retake photo" becomes the primary button.
   - "See treatment plan" → a placeholder screen (artboard Treatment, not built yet).
   - Copy change: drop "Free 7-day trial · cancel in one tap" until the paywall exists. Drop the species from the subtitle line.
9. **Save to My Plants sheet** (artboard SaveSheet): Name (pre-filled with "My plant"; required, trimmed, 1–40 characters), Room chips (Living room, Bedroom, Kitchen, the rooms already used, "+ New room" with a 1–30 character name). Lengths count Unicode code points, so a single emoji is never cut in half. (A multi-part emoji such as a flag or a skin-tone variant can still be split at the limit; accepted.) "Save plant" → saves, closes the scan modal, opens the My Plants tab. "Not now" closes the sheet.
10. **"Doesn't look right?" sheet** (artboard FeedbackSheet): Yes / Not sure / No. No → "What do you think it is?" (the other 2 candidates + "Something else") → "Save my answer". Then "Thanks!" → Done. Copy change: "Send and get a second look" becomes "Save my answer". The thanks text never promises a second look or a day-7 follow-up, and never claims the answer improves anything while the fake is active ("Thanks! Your answer is saved.").
11. **Error state** (artboard ErrorState layout, copy adapted): "We couldn't read this photo" + "Try again" (re-runs from the same photo) + "Scan another plant" (→ Camera). Used when preparing or diagnosing the photo fails or takes longer than 10s.

**My Plants (minimal)** (replaces the placeholder)
- List of saved plants, newest first: photo thumbnail, name, room, latest diagnosis name, saved date (local format). Rows whose latest diagnosis came from a fake diagnoser show a "Demo" tag.
- Empty state (artboard EmptyPlants): message + "Scan a plant" button that opens Scan.
- No plant detail, editing, deleting or status badges (they belong to the My Plants spec).

**Local storage** (`expo-sqlite`, see Data Model)
- A scan is only written to the database when the user saves the plant or sends feedback. If they leave without doing either, nothing is stored and the resized photo file is deleted.
- Saved photos are copied from the cache into the app's document folder (`photos/<scanId>.jpg`), so the OS can't clear them.
- If a scan is already stored (feedback first) and the user changes answers, the stored scan is updated. A later save keeps the plant link; a later feedback never removes it.
- A failed save only removes files that this save created. A photo an earlier save already stored is never deleted.
- Stored JSON uses `snake_case` keys. A corrupt row never crashes the list.

**Navigation**
- The flow is a stack inside the `scan` modal: camera → analyzing → questions → result. Analyzing replaces itself with Questions (or the error state), so it's never in the back history. Sheets are overlays on the current screen.
- Android Back and the iOS back swipe go back one step: Result → Questions, Questions step N → step N−1, Questions step 1 → Camera. On Camera, they close the modal. On Analyzing, Back cancels the run and returns to Camera; a late result is ignored.
- "Retake photo" (anywhere) goes back to Camera with a fresh session; the previous temp photo is deleted.
- "Save plant" closes the whole modal and lands on My Plants; Back from there doesn't reopen the scan.
- Opening a scan screen with no photo in the session (deep link, fast refresh, restore) redirects to Camera.
- The scan session (photo, diagnosis, answers) lives in memory for the flow and is cleared when the modal closes.
- Leftover temp photos (from a killed app or a late write after the modal closed) are swept when Scan opens, before the camera starts.
- The camera preview only runs while Camera is the visible screen.
- Camera permission is checked again when the app returns to the foreground (after the user visits Settings).

**Platforms**
- Android and iOS only. Web isn't supported from this spec on (local SQLite needs extra web setup); the README says so.

**Tokens**
- The camera screens' dark colors (`#0F140F`, `#F3F4EC`, `#3D4A34`, `#2C3726` and the overlay) go into `tokens.ts` as a `cameraColors` group. The existing guard test (no hex outside `src/theme/`) keeps holding.

**Config**
- iOS camera and photo-library usage strings and Android camera permission, set through the `expo-camera` / `expo-image-picker` config plugins in `app.json`.
- No microphone permission on either platform (`microphonePermission: false`, `recordAudioAndroid: false`); the image picker doesn't ask for the camera (`cameraPermission: false`).

**App start**
- The splash stays up until both the fonts and the database are ready. If the database fails to open or migrate, a plain error screen shows ("Rebloom couldn't start") with a Retry, never a blank app.

### Nice-to-have
- Haptic tap on shutter and on Save (`expo-haptics`).
- Respect reduced motion for the scan line, pulse and confidence-bar fill.

### Out of scope (each gets its own spec)
- The real on-device model, TFLite/ONNX, Kindwise Router (non-plant / person filter)
- Any backend: Supabase, auth, R2 upload, Gemini, sync of local data
- Treatment plan, paywall, day-7 check-in and reminders
- Plant detail, edit/delete plant, status badges, photo timeline
- Species identification
- Live leaf detection ("Leaf found · hold steady"), real blur detection, flash toggle, tap-to-focus UI
- Multiple photos per scan (the stack plan allows up to 5; later)
- Scan history for unsaved scans
- Web support (Android and iOS only; see Platforms)

## Data Model

Local SQLite (`rebloom.db`), following the project database rules: `snake_case`, UUID v4 `TEXT` ids (`expo-crypto` `randomUUID`), `TEXT` not `VARCHAR`, no foreign keys, soft delete with `deleted_at`, timestamps as ISO 8601 UTC strings (`2026-10-24T10:30:00.000Z`). Schema version in `PRAGMA user_version`. Migration 1 creates:

```sql
CREATE TABLE plants (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  room TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE scans (
  id TEXT PRIMARY KEY NOT NULL,
  plant_id TEXT,                 -- set when the plant is saved; NULL for feedback-only scans
  photo_path TEXT NOT NULL,      -- relative to the document folder: photos/<id>.jpg
  diagnoser_id TEXT NOT NULL,    -- e.g. fake-v1
  model_result TEXT NOT NULL,    -- JSON: top 3 before answers
  answers TEXT NOT NULL,         -- JSON: { watering, light, recent_change }, values or "not_sure"
  final_result TEXT NOT NULL,    -- JSON: top 3 after applyAnswers
  low_confidence INTEGER NOT NULL, -- 0 / 1, from final_result
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_scans_plant_id ON scans(plant_id) WHERE deleted_at IS NULL;

CREATE TABLE scan_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  scan_id TEXT NOT NULL,
  verdict TEXT NOT NULL,         -- yes | not_sure | no
  user_guess TEXT,               -- conditionId or "something_else"; only when verdict = no
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_scan_feedback_scan_id ON scan_feedback(scan_id) WHERE deleted_at IS NULL;
```

- Saving a plant writes the `plants` row and its `scans` row in one transaction.
- `persistScan` is an upsert: on conflict it updates `answers`, `final_result`, `low_confidence`, `updated_at`, and `plant_id = COALESCE(excluded.plant_id, plant_id)`.
- JSON columns use `snake_case` keys, e.g. `[{ "condition_id": "overwatering", "confidence": 0.82 }]`.
- Rooms have no table. The room list is the 3 defaults plus `SELECT DISTINCT room FROM plants WHERE deleted_at IS NULL`.
- All queries use bound parameters, never string-built SQL.

## API Changes

None. No backend in this spec.

## UI Changes

| Route / element | Type | Design reference |
|---|---|---|
| `/scan` (camera) | Modal stack root | Camera |
| Permission sheet | Bottom sheet on camera | PermissionSheet |
| Photo tips sheet | Bottom sheet on camera | RetakeSheet (tips list) |
| `/scan/analyzing` | Stack screen | Analyzing |
| Low-confidence sheet | Bottom sheet on analyzing | RetakeSheet |
| `/scan/questions` | Stack screen | Questions |
| `/scan/result` | Stack screen | Result |
| Save sheet | Bottom sheet on result | SaveSheet |
| Feedback sheet | Bottom sheet on result | FeedbackSheet |
| Error state | Screen state in the scan stack | ErrorState (copy adapted) |
| `/scan/treatment` | Placeholder screen | Treatment |
| `/(tabs)/plants` | Tab: list + empty state | MyPlants (list rows only), EmptyPlants |

All colors, type, radius and spacing come from `tokens.ts`. Touch targets ≥ 44×44, and every interactive element has an accessibility label and role.

## Edge Cases

1. **Camera permission denied**, including "Don't ask again" / iOS denied. The sheet shows "Open Settings" plus "Choose a photo instead". The flow never dead-ends.
2. **Gallery cancelled or permission denied.** Back on Camera, no error shown. If camera permission is also denied, the permission sheet shows again.
3. **Large, rotated, HEIC or odd-shaped photos** (48 MP, panorama, screenshot). Resize to 800px longest side and correct the orientation. If the manipulator fails, show the error state.
4. **Low confidence** (top-1 < 0.50). The low-confidence sheet appears after Analyzing. If the result is still low after the answers, Result shows its low-confidence variant.
5. **Leaving mid-flow** (X, Android Back, the app backgrounded or killed): nothing in the database, and the temp photo file is deleted. Coming back from the background keeps the user on the same step.
6. **Double taps**: shutter, gallery, "See my diagnosis", "Save plant" and "Save my answer" each act once (disabled while busy). One photo, one plant, one feedback row. Answering "Doesn't look right?" again later replaces the earlier answer; a scan never has more than one live feedback row.
7. **Name and room input**: empty or whitespace-only is blocked (button disabled). Name max 40, room max 30 characters, trimmed. Emoji and non-Latin text are allowed and display correctly.
8. **Storage failure** (SQLite error, disk full, photo copy fails): an error message on the sheet, the sheet stays open, and no half-saved plant (one transaction; the photo copy is cleaned up if the insert fails).
9. **Diagnoser throws or takes longer than 10s**: the error state with "Try again".
10. **Fake results mistaken for real**: the "Demo diagnosis" badge on every result from a diagnoser whose id starts with `fake`, a "Demo" tag on Analyzing and Questions, and on saved plants in My Plants.
11. **Small screens and large text** (iPhone SE, 200% font): Questions options and Result content scroll instead of clipping, and the main buttons stay reachable.
12. **Feedback stored, then a failed save**: the stored scan's photo survives.
13. **Answers changed after feedback was stored**: the stored scan has the new answers and result.
14. **Scan screen opened with no session** (deep link to `/scan/result`): redirect to Camera, no crash.
15. **Permission granted in Settings**: back in the app, the permission sheet goes away and the camera starts.
16. **Database fails to open or migrate**: the start error screen with Retry, not a blank app.

## Testing Criteria

Written test-first (TDD). Unit tests for logic, integration tests for screens and storage. Camera, image picker, manipulator and file system are mocked at the module boundary.

### Happy path
- [ ] `applyAnswers`: each rule in the table moves the right candidates, the output still has exactly the same 3 conditions, confidences stay in [0, 1], and the sum is unchanged (within 1e-9).
- [ ] Fake diagnoser: the same input gives the same output, and the outputs over a fixed set of inputs include both low- and normal-confidence results.
- [ ] `isLowConfidence`: true below 0.50, false at 0.50 and above.
- [ ] Repository: migration 1 creates the tables; `savePlant` writes a plant + scan in one transaction; `listPlants` returns newest first with the latest diagnosis; `saveFeedback` writes one row; soft-deleted rows are excluded.
- [ ] Flow (integration): Scan → allow camera → shutter → Analyzing → Questions (3 answers) → Result shows the re-ranked top 3, the answer chips and the "Demo diagnosis" badge.
- [ ] Save: fill the name, pick a room → the modal closes, My Plants shows the plant at the top.
- [ ] Feedback: No → pick a guess → "Save my answer" → Thanks; one `scan_feedback` row with the verdict and guess.
- [ ] My Plants: empty state when there are no plants; "Scan a plant" opens Scan.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` all pass.

### Edge cases
- [ ] Permission denied permanently → the sheet shows "Open Settings" and "Choose a photo instead".
- [ ] Gallery cancel → stays on Camera, nothing rendered as an error.
- [ ] Manipulator throws → error state; "Try again" re-runs; "Scan another plant" returns to Camera.
- [ ] Diagnoser rejects / times out (fake timers, 10s) → error state.
- [ ] Low-confidence result → the low-confidence sheet; "Use it anyway" → Questions; the final result still low → the low-confidence Result variant with "Retake photo" as the primary button.
- [ ] Closing the modal before saving → no rows in any table, and the delete-file mock was called for the temp photo.
- [ ] Double-pressing "Save plant" → exactly one plant row.
- [ ] Name of spaces only → "Save plant" disabled; a 41-character paste is cut to 40.
- [ ] The insert fails (mocked) → the sheet stays open with an error, no plant row, and the copied photo file is deleted.
- [ ] Android Back on Questions step 2 → step 1; on Camera → the modal closes.
- [ ] The no-hex guard test still passes with the new camera tokens.
- [ ] Feedback saved, then a failing save → the photo file still exists and the scan row still points at it.
- [ ] Feedback saved, then Back to Questions and a changed answer → the stored scan has the new answers.
- [ ] Back from Questions step 1 → Camera (not Analyzing).
- [ ] `initialUrl: '/scan/result'` with no session → Camera.
- [ ] App returns to the foreground with permission now granted → the sheet closes.
- [ ] Database init throws → the start error screen with Retry.
- [ ] A 40-character name made of emoji is kept whole; the 41st is dropped, never half an emoji.
- [ ] Manual check on an Android phone (Expo Go 58) and an iOS simulator: real camera, gallery, permission denied path, iPhone SE size, 200% text. These are manual by nature: returning from the background keeps the step, and large text scrolls.

### After the build (break-test protocol)
- Break-test findings are reported before any fixes, then mass verification with property-based tests (`fast-check`) over `applyAnswers`, the fake diagnoser and input validation, plus the adversarial agent pass.

## Dependencies

- The app skeleton (merged in PR #1): tabs, the `scan` modal, tokens, fonts.
- npm packages (install with `npx expo install`; check every API against the SDK 58 docs before use): `expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `expo-sqlite`, `expo-file-system`, `expo-crypto`. Optional: `expo-haptics`. Dev: `fast-check`.
- All of these ship in Expo Go 58, so no dev build is needed for this feature.
- Android phone with Expo Go 58.0.5 (the user's test device) and an iOS simulator for the manual checks.

## Open Questions

- The Save sheet's name default: the design shows the species ("Monstera"), but there's no species ID. The spec uses "My plant" as the default; a species field arrives with the My Plants spec.
- Re-rank rule weights are a first guess. Tune them when the real model and labelled day-7 data exist.
- **Phone backups (Sanket to decide):** iCloud backup and Android Auto Backup copy the app's document folder and database by default, so saved plant photos are in the user's own phone backup. Options: keep backups (plants survive a phone change; "stays on your phone" means Rebloom never uploads it), or turn off Android Auto Backup (`android.allowBackup: false`) and accept plants are lost on a new phone. This spec keeps the default until decided.

---

## Gate 1

**Completeness**
- [x] Problem is clearly stated
- [x] Goal is specific and measurable (full flow works offline, save + feedback persist, 3 checks pass)
- [x] At least one user story (5)
- [x] Requirements split into must-have, nice-to-have, out of scope
- [x] Out of scope section exists

**Data Model**
- [x] New tables have standard columns (`id`, `created_at`, `updated_at`)
- [x] Column types are correct (`TEXT` ids and timestamps, `INTEGER` flag; SQLite has no `TIMESTAMPTZ`, so ISO 8601 UTC strings)
- [x] Soft delete strategy is defined (`deleted_at`, partial indexes)

**API Design**: N/A, no backend in scope.

**Quality**
- [x] Edge cases listed (16)
- [x] Testing criteria for happy path
- [x] Testing criteria for edge cases
- [x] Dependencies listed

**Result: PASSED**
