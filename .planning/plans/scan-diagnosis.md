# Plan: Scan → Diagnosis

**Spec**: .planning/specs/scan-diagnosis.md
**Epic**: none
**Created**: 2026-10-24 · **Revised**: 2026-10-24 (gate review round 1: 3 blockers, 12 should-fixes, nits)
**Status**: draft

**Stack**: Expo SDK 58 · Expo Router 58 · TypeScript strict · jest-expo 58 + @testing-library/react-native 14. New: `expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `expo-sqlite`, `expo-file-system`, `expo-crypto` (all in Expo Go 58). Dev: `sql.js` (test-only SQLite engine), `fast-check` (mass verification).

**API facts checked against the SDK 58 docs (2026-10-24)**
- Camera: `CameraView` (prop `active`) + ref `takePictureAsync()` → `{ uri, width, height }`; wait for `onCameraReady`; the `uri` is temporary. `useCameraPermissions()` → `[PermissionResponse | null, request, get]` with `granted`, `canAskAgain`, `status`. Config plugin: `cameraPermission`, `microphonePermission`, `recordAudioAndroid`.
- Picker: `launchImageLibraryAsync({ mediaTypes: ['images'] })` → `{ canceled, assets }`; no permission prompt needed for images. Config plugin: `photosPermission`, `cameraPermission`, `microphonePermission`.
- Manipulator: `ImageManipulator.manipulate(uri).resize({ width } | { height })` → `renderAsync()` → `saveAsync({ format: SaveFormat.JPEG, compress })` → `{ uri, width, height }`. `manipulateAsync` is deprecated; don't use it. **The docs don't say whether EXIF orientation gets applied** (see Risks).
- SQLite: `SQLiteProvider` (`onInit`, `onError`) + `useSQLiteContext()`, `execAsync` (no escaping: schema only), `runAsync` / `getFirstAsync` / `getAllAsync` with bound params, `withTransactionAsync`.
- File system: `File`, `Directory`, `Paths.document`, `Paths.cache`; `file.copy(dest)`, `file.delete()`, `.exists` / `.size` (properties), `new Directory(...).create({ intermediates: true, idempotent: true })`. Don't use the legacy root API (it throws at runtime).
- **To verify during the build** (Expo Router 58 docs, then pinned by tests): `router.dismissTo`, `router.replace` inside a nested modal stack, `useIsFocused`, `Redirect`.

---

## Architecture

Layers. Routes call the scan services and session; services call the domain, storage and photos; nothing calls up.

```
routes (src/app/…)              screens: render + wire events, no business rules
  ├── scan session (context)    photo, diagnosis, answers for one flow; temp-file ownership
  ├── scan services             saveScan.ts: saveAsPlant / saveFeedback (compose photos + repos, own cleanup)
  │                             runDiagnosis.ts: prepare → diagnose with min duration + timeout
  ├── components                dumb UI from the artboards (overlays, buttons, badges)
  ├── diagnosis/                Diagnoser interface, fake, catalogue, questions, re-rank (pure)
  ├── storage/                  migrations + repositories over a Db subset (bound params only)
  └── photos/                   prepare (resize, delete source), persist (copy), delete, sweep
theme/                          tokens (the only hex values)
```

### Route tree (after)

```
Root Stack (src/app/_layout.tsx)    fonts + SQLiteProvider(onInit=migrate, onError → StartError); splash hides when both ready
├── (tabs)
│   ├── index        → Today (unchanged)
│   └── plants       → My Plants list + empty state        (was placeholder)
├── scan/            fullScreenModal (was scan.tsx)
│   ├── _layout      Stack, no headers, ScanSessionProvider; sweeps cache/scans/ before rendering children
│   ├── index        Camera (CameraView active only while focused) + permission and tips overlays
│   ├── analyzing    runDiagnosis → router.replace(questions); low-confidence overlay; error shown in-screen (Try again); Back = cancel → Camera
│   ├── questions    3 steps; Back on step 1 → Camera; "See my diagnosis" → finish() → push result
│   ├── result       result + Save and Feedback overlays
│   └── treatment    placeholder
└── settings (unchanged)
```

- **Back history**: Camera → (Analyzing replaced by) Questions → Result. Analyzing is never in the history, so Back from Questions step 1 lands on Camera (finding 3).
- **Retake** (low-confidence overlay, Result, error state): `router.dismissTo('/scan')` first; the Camera screen starts a fresh scan on the next `setPhoto` (below). Nothing resets the session while a guarded screen is still mounted.
- **Closing the modal**: on Camera, X / Back → `router.back()` (unchanged, so the existing navigation tests stay valid). After "Save plant": `router.dismissTo('/plants')`, then Back from My Plants doesn't reopen the scan. Verified in T22, plus a manual check.
- **Session guard**: Analyzing, Questions and Result render `<Redirect href="/scan" />` when the session has no photo (or no diagnosis for Questions/Result). The guard only covers arriving with no session (deep link, refresh, restore). Retake and Save navigate first and never clear the session underneath a mounted screen, so the guard can't race them; the session is dropped with the modal (Save) or replaced by `setPhoto` (Retake).
- **New photo = new scan**: `setPhoto` deletes the old temp photo and starts a new scan: a new `scanId`, no diagnosis, no answers, `persisted` and `photoStored` false. So Back to Camera after a saved feedback and a new shot never reuses the old scan row or photo.
- **Feedback can be changed**: reopening "Doesn't look right?" after Thanks and answering again replaces the earlier answer (`saveFeedback` soft-deletes the scan's earlier feedback rows and inserts the new one in the same transaction). There's always at most one live feedback row per scan.
- **Overlays, not RN `Modal`**: `BottomSheet` is an in-tree absolute overlay (scrim + sheet), with `BackHandler` closing it on Android, `accessibilityViewIsModal` on the sheet, and `importantForAccessibility="no-hide-descendants"` on the screen underneath. This avoids the iOS "presentation in progress" problem of a `Modal` over a native fullScreenModal when Save navigates away in the same tick.
- **Scan session**: a React context with a reducer in `scan/_layout.tsx`. It owns the temp photo: `setPhoto` deletes the previous temp photo; unmount deletes the current one. It also tracks `persisted` (the scan row exists) and `photoStored` (the document copy exists).
- **Persistence (saveScan.ts)**:
  - `saveFeedback(db, session, feedback)`: if `!photoStored` → `persistPhoto` (created = true). Then `persistScan` + `replaceFeedback` in one `withTransactionAsync`. On failure: delete the copy only if `created && !persisted`. On success: `markPersisted`.
  - `saveAsPlant(db, session, { name, room })`: same photo rule. Then `insertPlant` + `persistScan(plantId)` in one transaction. Same cleanup rule.
  - `persistScan` is an upsert: on conflict it updates `answers`, `final_result`, `low_confidence`, `updated_at`, and `plant_id = COALESCE(excluded.plant_id, plant_id)`. So feedback first then changed answers then save is all correct (finding 2).
- **Transactions**: plain `withTransactionAsync`. Writes are already serialized by `useSingleFlight`, and the exclusive variant uses a second connection that can hit "database is locked" against a My Plants read (finding 8).
- **Temp photos**:
  - `preparePhoto` writes to `Paths.cache/scans/`, then deletes the source if it's under `Paths.cache` (the camera capture or the picker copy).
  - The scan layout sweeps `cache/scans/` before rendering the camera. No session photo can exist yet, so there's no race (finding 6). This also covers an app kill and late writes after unmount.
  - "Try again" reuses the prepared photo if it exists, and only re-prepares if preparing was what failed.
- **Camera lifecycle**: `CameraView active={isFocused}`; `ready` resets on blur and is awaited again (finding 11). Permission refetch on `AppState` → `active` (finding 10).
- **Testing SQLite**: repositories type `db` as `Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'withTransactionAsync'>`. Tests use a `sql.js` adapter (pure JS `sql-asm.js`, no native code or wasm) with the same methods, so the real SQL, indexes and transactions run in Node. A jest setup mock makes `expo-sqlite`'s `SQLiteProvider` / `useSQLiteContext` serve that adapter in screen tests. It's one connection only, so connection-level locking is a device-check item.
- **Platforms**: Android and iOS. Web isn't supported (README).

### Components

| Component | Type | Purpose |
|---|---|---|
| `types` | Types | `ConditionId`, `Candidate`, `Diagnosis`, `Diagnoser`, `PreparedPhoto { uri, width, height, sizeBytes }`, `Answers` |
| `conditions` | Data | Catalogue: id, name, subtitle, severity (7 conditions) |
| `questions` | Data | 3 questions with option ids + labels exactly as the Questions artboard |
| `applyAnswers` + `RULES` | Pure function | Re-rank the top 3 by the answers (spec rules table), re-normalize |
| `isLowConfidence`, `headerLabel`, `isDemoDiagnoser` | Pure functions | Threshold 0.50; "Overwatering or root rot?"; `id.startsWith('fake')` |
| `fakeDiagnoser` | Diagnoser | Deterministic FNV-1a over `${width}x${height}:${sizeBytes}` → one of 8 fixtures (2 low); id `fake-v1` |
| `withTimeout`, `withMinDuration` | Async helpers | 10s timeout, 1.2s minimum |
| `useSingleFlight` | Hook | Run an async action once at a time; `busy` disables the button |
| `limitChars`, `validateName`, `validateRoom` | Pure functions | Code-point truncation; trim, 1–40 / 1–30, not whitespace-only |
| `migrate` | Storage | `PRAGMA user_version` migration 1 (spec schema) |
| `plantsRepo` | Repository | `insertPlant(tx)`, `listPlants` (newest first, latest diagnosis + diagnoser id, defensive JSON parse), `listRooms` |
| `scansRepo` | Repository | `persistScan(tx)` (upsert), `replaceFeedback(tx)` (soft-delete earlier rows for the scan, insert the new one) |
| `photos` | Service | `preparePhoto` (resize longest side, no upscale, delete cache source), `persistPhoto`, `deletePhoto`, `sweepTempPhotos` |
| `runDiagnosis` | Scan service | `prepare (if needed) → diagnose` inside `withTimeout(10s, withMinDuration(1.2s, …))`, with an abort signal |
| `saveScan` | Scan service | `saveAsPlant`, `saveFeedback` with the cleanup rule |
| `ScanSession` | Context + reducer | `setPhoto`, `setDiagnosis`, `answer`, `finish`, `markPersisted`, `markPhotoStored`, `reset` |
| `BottomSheet` | Component | In-tree overlay sheet, Back closes, a11y modal |
| `Button`, `TextButton` | Components | Primary / text buttons with `busy` + `disabled`, ≥44 targets |
| `DemoTag`, `ConfidenceBar`, `Chip` | Components | "Demo" / "Demo diagnosis" tag; confidence bar; answer chip |
| `PermissionSheet`, `TipsSheet`, `LowConfidenceSheet` | Components | The sheets from PermissionSheet / RetakeSheet |
| `ErrorState`, `StartError` | Components | Scan error ("We couldn't read this photo"); app start error ("Rebloom couldn't start" + Retry) |
| `SaveSheet`, `FeedbackSheet` | Components | The sheets from SaveSheet / FeedbackSheet |
| `PlantRow`, `EmptyPlants` | Components | My Plants row (with Demo tag) + empty state |

### File locations (new)

| File | Location | Purpose |
|---|---|---|
| `types.ts`, `conditions.ts`, `questions.ts` | `app/src/diagnosis/` | Domain types and data |
| `rerank.ts`, `confidence.ts`, `fakeDiagnoser.ts` | `app/src/diagnosis/` | Pure logic |
| `catalogue.test.ts`, `rerank.test.ts`, `confidence.test.ts`, `fakeDiagnoser.test.ts` | `app/src/diagnosis/__tests__/` | Unit tests |
| `async.ts`, `useSingleFlight.ts`, `text.ts` | `app/src/lib/` | Timeout/min-duration, single-flight, `limitChars` |
| `async.test.ts`, `useSingleFlight.test.tsx`, `text.test.ts` | `app/src/lib/__tests__/` | Unit tests |
| `db.ts`, `migrations.ts`, `plantsRepo.ts`, `scansRepo.ts` | `app/src/storage/` | `Db` type, schema, repositories |
| `migrations.test.ts`, `plantsRepo.test.ts`, `scansRepo.test.ts` | `app/src/storage/__tests__/` | Data layer tests on sql.js |
| `photos.ts` | `app/src/photos/` | Prepare / persist / delete / sweep |
| `photos.test.ts` | `app/src/photos/__tests__/` | With file-system + manipulator fakes |
| `validation.ts` | `app/src/plants/` | Name / room rules |
| `validation.test.ts` | `app/src/plants/__tests__/` | Unit tests |
| `session.tsx`, `runDiagnosis.ts`, `saveScan.ts` | `app/src/scan/` | Session + scan services |
| `session.test.tsx`, `runDiagnosis.test.ts`, `saveScan.test.ts` | `app/src/scan/__tests__/` | Service tests |
| `sqljs.ts`, `fileSystemFake.ts`, `nativeMocks.ts` | `app/src/testing/` | Test-only adapters and fakes (never imported by app code) |
| `jest.setup.ts` | `app/` | Registers the module mocks |
| `BottomSheet.tsx`, `Button.tsx`, `StartError.tsx` | `app/src/components/` | Shared UI |
| `BottomSheet.test.tsx`, `Button.test.tsx` | `app/src/components/__tests__/` | UI tests |
| `DemoTag.tsx`, `ConfidenceBar.tsx`, `Chip.tsx` | `app/src/scan/components/` | Result pieces |
| `PermissionSheet.tsx`, `TipsSheet.tsx`, `LowConfidenceSheet.tsx`, `ErrorState.tsx` | `app/src/scan/components/` | Camera / analyzing overlays and error |
| `SaveSheet.tsx`, `FeedbackSheet.tsx` | `app/src/scan/components/` | Result overlays |
| `scan-components.test.tsx`, `SaveSheet.test.tsx`, `FeedbackSheet.test.tsx` | `app/src/scan/components/__tests__/` | Component tests |
| `_layout.tsx`, `index.tsx`, `analyzing.tsx`, `questions.tsx`, `result.tsx`, `treatment.tsx` | `app/src/app/scan/` | Scan routes |
| `PlantRow.tsx`, `EmptyPlants.tsx` | `app/src/plants/components/` | My Plants UI |
| `scan-camera.test.tsx`, `scan-flow.test.tsx`, `my-plants.test.tsx` | `app/src/__tests__/` | Integration tests over the real route tree |

### Files to change

| File | What changes | Why |
|---|---|---|
| `app/src/app/scan.tsx` | Deleted; replaced by the `app/src/app/scan/` folder | The flow is a nested stack |
| `app/src/app/_layout.tsx` | Wrap the Stack in `SQLiteProvider databaseName="rebloom.db" onInit={migrate} onError={…}`; hide the splash from a child that mounts only after the DB is ready (fonts also ready); render `StartError` with Retry on DB failure | Spec: App start; finding 9 |
| `app/src/__tests__/root-layout.test.tsx` | Add: DB init throws → `StartError` shown; splash hides only after both are ready | Edge 16 |
| `app/src/app/(tabs)/plants.tsx` | Placeholder → list + empty state, reload with `useFocusEffect` | Spec: minimal My Plants |
| `app/src/theme/tokens.ts` (+ test) | Add `cameraColors` (`#0F140F` ground, `#F3F4EC` text, `#3D4A34` preview, `#2C3726` analyzing, `#1E2A1C` button, `#AEB8A4` caption) and `scrim` (`rgba(15,20,15,0.55)`) | Spec: tokens; guard test |
| `app/src/components/icons.tsx` | Add Gallery, Help, Bookmark, Lock, Check, ChevronLeft icons from the artboards | Camera, Result, Analyzing |
| `app/app.json` | `expo-camera` plugin (`cameraPermission` string, `microphonePermission: false`, `recordAudioAndroid: false`); `expo-image-picker` plugin (`photosPermission` string, `cameraPermission: false`, `microphonePermission: false`). No `expo-sqlite` plugin unless `expo-doctor` asks | Spec: Config; finding 13 |
| `app/package.json` | New deps; jest `setupFiles: ["./jest.setup.ts"]` | Mocks for native modules |
| `app/README.md` | Fake diagnoser + Demo tags, web not supported, how tests mock native modules | Docs |

---

## Tasks

Each task is one commit. **Strict TDD**: write the test, watch it fail, then implement. No task's test column says "covered later". Branch: `feature/scan-diagnosis` off `develop`.

### Phase 0: Setup

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 1 | Create the branch. `npm ci`. `npx expo install expo-camera expo-image-picker expo-image-manipulator expo-sqlite expo-file-system expo-crypto`; `npm i -D sql.js @types/sql.js`. Config plugins as in "Files to change" | `package.json` (+ lock), `app.json` | A guard test: `app.json` camera/picker plugins have mic off and picker camera off. `npx expo-doctor` clean; the existing `test`, `typecheck` and `lint` pass |
| 2 | Camera tokens and scrim | `src/theme/tokens.ts`, `src/theme/__tests__/tokens.test.ts` | T1 |
| 3 | New stroke icons (decorative, `accessible={false}`) | `src/components/icons.tsx`, `src/components/__tests__/icons.test.tsx` | Each icon renders and is hidden from accessibility |

### Phase 1: Diagnosis domain, pure (depends on 1)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 4 | Types + condition catalogue + questions (option ids such as `water_2_3_days`, labels exactly as the artboard) | `src/diagnosis/types.ts`, `conditions.ts`, `questions.ts` (+ `__tests__/catalogue.test.ts`) | T2 |
| 5 | `applyAnswers` + `RULES` table | `src/diagnosis/rerank.ts`, `__tests__/rerank.test.ts` | T3 |
| 6 | `isLowConfidence`, `headerLabel`, `isDemoDiagnoser` | `src/diagnosis/confidence.ts`, `__tests__/confidence.test.ts` | T4 |
| 7 | `fakeDiagnoser`: 8 fixtures (2 low), FNV-1a over the prepared photo's `${width}x${height}:${sizeBytes}` | `src/diagnosis/fakeDiagnoser.ts`, `__tests__/fakeDiagnoser.test.ts` | T5 |
| 8 | `withTimeout` (rejects with `TimeoutError`) and `withMinDuration` | `src/lib/async.ts`, `src/lib/__tests__/async.test.ts` | T6 |
| 9 | `useSingleFlight` | `src/lib/useSingleFlight.ts`, `src/lib/__tests__/useSingleFlight.test.tsx` | T7 |
| 10 | `limitChars` (code points) + `validateName` / `validateRoom` | `src/lib/text.ts`, `src/plants/validation.ts` (+ `text.test.ts`, `validation.test.ts`) | T8 |

### Phase 2: Storage + photos (depends on 1)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 11a | Test infrastructure, part 1: the `sql.js` adapter implementing the `Db` subset (`withTransactionAsync` rolls back on throw) + its registration in `jest.setup.ts` / the `package.json` jest config | `src/testing/sqljs.ts`, `jest.setup.ts`, `package.json` | Smoke test: `SELECT 1`; a throwing transaction rolls back |
| 11b | Test infrastructure, part 2: the in-memory file-system fake and native mocks (`expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `expo-crypto`, `expo-sqlite` provider with `onInit` / `onError`), typed against the real packages | `src/testing/fileSystemFake.ts`, `src/testing/nativeMocks.ts`, `jest.setup.ts` | Smoke test: the fake file copy/delete/exists/size; the provider runs `onInit` then renders children |
| 12 | `Db` type + `migrate` (spec schema, partial indexes, `user_version = 1`, safe to re-run) | `src/storage/db.ts`, `src/storage/migrations.ts`, `__tests__/migrations.test.ts` | T9 |
| 13 | `scansRepo`: `persistScan` upsert (updates answers/result/flag/updated_at, `COALESCE` on `plant_id`), `replaceFeedback`; snake_case JSON | `src/storage/scansRepo.ts`, `__tests__/scansRepo.test.ts` | T10 |
| 14 | `plantsRepo`: `insertPlant`, `listPlants` (`ORDER BY created_at DESC, id`, latest scan's diagnosis name + `diagnoser_id`, defensive JSON parse), `listRooms` | `src/storage/plantsRepo.ts`, `__tests__/plantsRepo.test.ts` | T11 |
| 15 | `photos`: `preparePhoto` (resize longest side, no upscale, JPEG 0.8, into `cache/scans/`, returns `sizeBytes`, deletes a source under `Paths.cache` only), `persistPhoto` (copy to `document/photos/<id>.jpg`; returns `created`), `deletePhoto`, `sweepTempPhotos` | `src/photos/photos.ts`, `src/photos/__tests__/photos.test.ts` | T12 |

### Phase 3: Session, services, shared UI (depends on Phases 1 and 2)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 16 | `ScanSession` reducer + provider (temp-photo ownership, `persisted`, `photoStored`) | `src/scan/session.tsx`, `src/scan/__tests__/session.test.tsx` | T13 |
| 17 | `runDiagnosis` (reuse a prepared photo; abort signal; min duration + timeout) | `src/scan/runDiagnosis.ts`, `src/scan/__tests__/runDiagnosis.test.ts` | T13b |
| 18 | `saveScan`: `saveAsPlant`, `saveFeedback` with the cleanup rule | `src/scan/saveScan.ts`, `src/scan/__tests__/saveScan.test.ts` | T13c |
| 19 | `BottomSheet` (in-tree overlay, `KeyboardAvoidingView`, bottom safe-area padding) and `Button` / `TextButton` | `src/components/BottomSheet.tsx`, `src/components/Button.tsx` (+ `BottomSheet.test.tsx`, `Button.test.tsx`) | T14 |
| 20 | `DemoTag`, `ConfidenceBar` (`accessibilityRole="progressbar"`, value), `Chip` | `src/scan/components/DemoTag.tsx`, `ConfidenceBar.tsx`, `Chip.tsx` (+ `scan-components.test.tsx`) | T15 |
| 21 | `PermissionSheet`, `TipsSheet`, `LowConfidenceSheet`, `ErrorState` (copy as in the spec) | `src/scan/components/PermissionSheet.tsx`, `TipsSheet.tsx`, `LowConfidenceSheet.tsx` + `ErrorState.tsx` (+ cases in `scan-components.test.tsx`) | T15 *(4 small presentational files, noted)* |

### Phase 4: Routes (depends on Phase 3)

| # | Task | Files | Test (written first) |
|---|---|---|---|
| 22 | Root layout: `SQLiteProvider` + `migrate` + `onError` → `StartError` (Retry remounts the provider); splash hides after fonts + DB | `src/app/_layout.tsx`, `src/components/StartError.tsx`, `src/__tests__/root-layout.test.tsx` | T10b; the existing root-layout tests still pass |
| 23 | Move `scan.tsx` → `scan/_layout.tsx` (Stack + `ScanSessionProvider` + sweep before children) and `scan/index.tsx` (temporary body keeping "Close camera") | `src/app/scan/_layout.tsx`, `src/app/scan/index.tsx` (delete `src/app/scan.tsx`) | The existing `navigation.test.tsx` passes; new: the sweep runs before the camera renders |
| 24 | Camera, part 1: permission states (undetermined → sheet → request; denied + `canAskAgain=false` → Open Settings + gallery; `AppState` active → `getPermission`; a dismissed sheet while denied shows an inline "Camera is off" state with the same two buttons) | `src/app/scan/index.tsx`, `src/__tests__/scan-camera.test.tsx` | T16a |
| 25 | Camera, part 2: `CameraView active={isFocused}`, framing corners, prompt chip, shutter (single-flight, waits for `onCameraReady`), gallery (cancel = no-op), tips sheet → `setPhoto` → push `analyzing` | `src/app/scan/index.tsx`, `src/__tests__/scan-camera.test.tsx` | T16b |
| 26 | `analyzing.tsx`: session guard, steps, Demo tag, `runDiagnosis`, low-confidence overlay (Retake / Use it anyway → `replace('questions')`), error → `ErrorState` (Try again / Scan another plant), success → `replace('questions')`; Back/unmount aborts | `src/app/scan/analyzing.tsx`, `src/__tests__/scan-flow.test.tsx` | T17 |
| 27 | `questions.tsx`: session guard, header card + Demo tag, progress, radio options, "I'm not sure", Back step N → N−1, Back step 1 → Camera, ScrollView content, "See my diagnosis" → `finish()` → push `result` | `src/app/scan/questions.tsx`, `scan-flow.test.tsx` | T18a |
| 28 | `result.tsx` + `treatment.tsx`: session guard, most likely + severity chip, confidence bar, other possibilities, answer chips, "Demo diagnosis" tag, low-confidence variant, ScrollView, Retake → reset + `dismissTo('/scan')`, See treatment plan → `/scan/treatment` (Placeholder) | `src/app/scan/result.tsx`, `src/app/scan/treatment.tsx`, `scan-flow.test.tsx` | T18b |
| 29 | `SaveSheet` (name default "My plant", `limitChars` 40 in `onChangeText`, no `maxLength`; rooms = defaults ∪ `listRooms`; "+ New room" inline input, 30; error text) + wiring on Result: `saveAsPlant` → `dismissTo('/plants')` | `src/scan/components/SaveSheet.tsx`, `__tests__/SaveSheet.test.tsx`, `src/app/scan/result.tsx` | T19 |
| 30 | `FeedbackSheet` (Yes / Not sure / No → guess → "Save my answer" → "Thanks! Your answer is saved.") + wiring: `saveFeedback` | `src/scan/components/FeedbackSheet.tsx`, `__tests__/FeedbackSheet.test.tsx`, `src/app/scan/result.tsx` | T20 |
| 31 | My Plants: `PlantRow` (thumbnail from `Paths.document` + `photo_path`, name, room, diagnosis, local date, Demo tag), `EmptyPlants` (Scan a plant → `/scan`), `plants.tsx` with `useFocusEffect` | `src/plants/components/PlantRow.tsx`, `EmptyPlants.tsx`, `src/app/(tabs)/plants.tsx` (+ `src/__tests__/my-plants.test.tsx`) | T21 |

### Phase 5: Verify (depends on all)

| # | Task | Files | Test |
|---|---|---|---|
| 32 | Full-flow integration tests: end to end; close before saving; feedback then failing save; feedback then changed answers then save | `src/__tests__/scan-flow.test.tsx` | T22–T25 |
| 33 | README update; run `typecheck`, `lint`, `test`, `npx expo-doctor`: all must pass | `app/README.md` | All exit 0 |
| 34 | Manual device pass (checklist below); record results in this plan | `.planning/plans/scan-diagnosis.md` | Checklist ticked |
| 35 | **Break-test (report only)**: list how the feature can or will break, with repro, severity, likelihood and suggested fix. **No code changes.** Stop for discussion. | none | none |
| 36 | After the discussion: fix the agreed findings TDD-style, then mass verification: `fast-check` property tests (`applyAnswers` invariants, fake-diagnoser determinism, `limitChars` / validation over random unicode, `persistScan` upsert sequences) + the adversarial agent swarm (~10 personas) | per finding | Pass/fail per finding |

### Parallel vs sequential

| Parallel group | Tasks | Why |
|---|---|---|
| A | 2, 3, 4 | Tokens, icons and domain types don't touch each other |
| B | 5–10 | Independent pure modules (5–7 need task 4) |
| C | 12–15 after 11a/11b | Separate files on the shared test infrastructure (14 uses 13's scan rows in its tests) |
| D | 19, 20, 21 | Separate component files |

| Sequential | Depends on | Why |
|---|---|---|
| 11a, 11b | 1 | Need `sql.js` and the packages installed |
| 16 | 5, 15 | `finish()` uses `applyAnswers`; the provider deletes photos |
| 17 | 7, 8, 15 | Prepare + diagnose + timing |
| 18 | 13, 14, 15, 16 | Composes the repos, photos and session flags |
| 22 | 12, 11b | `migrate` + the provider mock |
| 23 | 16, 15 | Session provider + sweep |
| 24–31 | 23, 17–21 | Screens need the layout, services and components |
| 29, 30 | 28 | Both edit `result.tsx`, one after the other |
| 32–36 | all | Final checks |

Solo developer, so the build runs 1 → 35 in order, then stops for the break-test discussion.

---

## Testing Plan

| ID | Test | File | Spec trace |
|---|---|---|---|
| T1 | `cameraColors` and `scrim` exist with the artboard values; the no-hex guard still passes | `tokens.test.ts`, `guards.test.ts` | Tokens |
| T2 | Catalogue has the 7 required conditions with unique ids and a severity; the questions match the artboard text exactly; option ids are unique | `catalogue.test.ts` | Catalogue, questions |
| T3 | Each rule moves the right candidates; output keeps exactly the same 3 condition ids; confidences in [0, 1]; the sum unchanged (±1e-9); "not sure" / unknown answers are a no-op; sorted descending | `rerank.test.ts` | Re-ranking table |
| T4 | `isLowConfidence`: 0.4999 → true, 0.50 → false. `headerLabel` → "Overwatering or root rot?". `isDemoDiagnoser('fake-v1')` true, `'tflite-v1'` false | `confidence.test.ts` | Threshold; header; edge 10 |
| T5 | Same `(w, h, sizeBytes)` → same output; a different uri with the same values → same output; 100 inputs hit both low and normal fixtures; every output is a valid top 3; id `fake-v1` | `fakeDiagnoser.test.ts` | Fake diagnoser |
| T6 | `withTimeout` rejects with `TimeoutError` at 10s (fake timers), passes early results; `withMinDuration` waits 1.2s for a fast promise and passes rejections through | `async.test.ts` | Edge 9; Analyzing ≥1.2s |
| T7 | `useSingleFlight`: two rapid calls → runs once; `busy` true during, false after (also after a throw) | `useSingleFlight.test.tsx` | Edge 6 |
| T8 | `limitChars('🌱'.repeat(41), 40)` → 40 whole emoji, no lone surrogate; name `"   "` invalid, `"My plant"` valid, 41 code points invalid, non-Latin valid, trimmed; room 1–30 | `text.test.ts`, `validation.test.ts` | Edge 7 |
| T9 | Migration creates the 3 tables + both partial indexes; `user_version = 1`; re-run is a no-op | `migrations.test.ts` | Data model |
| T10 | `persistScan` inserts once; again with a `plantId` → `plant_id` set, no duplicate; again without a `plantId` → `plant_id` kept; again with new answers → answers/result updated; `replaceFeedback` writes verdict + guess, and a second call leaves exactly one live row (the first soft-deleted); JSON keys snake_case; an injection string is stored literally | `scansRepo.test.ts` | Upsert; edges 12, 13; bound params |
| T10b | Root layout: DB init throws → "Rebloom couldn't start" + Retry; the splash hides only after fonts and DB are ready | `root-layout.test.tsx` | Edge 16; App start |
| T11 | `listPlants` newest first (tie-break by id), latest diagnosis name + `diagnoser_id`, excludes `deleted_at`, a corrupt `final_result` row shows without a diagnosis instead of throwing; `listRooms` distinct non-deleted | `plantsRepo.test.ts` | My Plants; soft delete |
| T12 | `preparePhoto`: 4000×3000 → width 800; 3000×4000 → height 800; 600×400 → not upscaled; returns `sizeBytes`; deletes a `cache/` source, never a non-cache source; throw → rejects. `persistPhoto` copies, idempotent, returns `created`. `sweepTempPhotos` empties `cache/scans/` only | `photos.test.ts` | Prepare photo; edges 3, 5 |
| T13 | Reducer: `setPhoto` deletes the previous temp photo and starts a new scan (new `scanId`; diagnosis, answers, `persisted`, `photoStored` cleared), including after `markPersisted`; `finish()` stores the re-ranked result; `reset` clears and deletes; unmount deletes the temp photo | `session.test.tsx` | Session; retake; edge 5 |
| T13b | `runDiagnosis`: reuses an existing prepared photo; abort → result ignored; prepare failure → error kind `prepare`; diagnose timeout → `TimeoutError` | `runDiagnosis.test.ts` | Edges 3, 9; Try again |
| T13c | `saveAsPlant`: copy + plant + scan; insert fails → the copy deleted, no rows. `saveFeedback` then a failing `saveAsPlant` → the photo still exists and the scan row still points at it. Feedback → changed answers → save → one scan row with the new answers and the plant id | `saveScan.test.ts` | Edges 8, 12, 13 |
| T14 | `BottomSheet`: sheet has `accessibilityViewIsModal`, the content behind is hidden from a11y, Android Back (`BackHandler`) closes, bottom padding includes the safe-area inset (mocked 34); `Button` `busy` → disabled + `accessibilityState.busy` | `BottomSheet.test.tsx`, `Button.test.tsx` | A11y; edge 6 |
| T15 | `DemoTag` text variants; `ConfidenceBar` exposes value 82; the sheets render the spec copy (no "second look", no "blurry", no "sent for a closer look"); `ErrorState` buttons fire | `scan-components.test.tsx` | Copy changes; edge 10 |
| T16a | Permission: undetermined → sheet → Allow → camera; denied + `canAskAgain=false` → "Open Settings" calls `Linking.openSettings`, "Choose a photo instead" opens the picker; `AppState` active with now-granted → sheet gone; sheet dismissed while denied → "Camera is off" state | `scan-camera.test.tsx` | Edges 1, 15 |
| T16b | Shutter disabled until `onCameraReady`; double-press → one `takePictureAsync`; picker cancel → stays, no error; tips sheet opens/closes; `CameraView` `active` false when the screen is blurred; X → modal closes | `scan-camera.test.tsx` | Steps 2–3; edges 2, 6 |
| T17 | Analyzing: no session → `/scan`; shows the steps + Demo tag; low → overlay; "Use it anyway" → Questions; "Retake photo" → Camera with a new session; prepare throws → error state; diagnoser hangs → error at 10s; "Try again" reuses the photo; Back mid-run → Camera, a late result ignored | `scan-flow.test.tsx` | Steps 5–6, 11; edges 3, 4, 9, 14 |
| T18a | Questions: no diagnosis → `/scan`; header shows the top two names + Demo tag; "N of 3"; "I'm not sure" advances; Back step 2 → step 1; **Back step 1 → Camera (not Analyzing)**; content is in a ScrollView | `scan-flow.test.tsx` | Step 7; navigation; edge 11 |
| T18b | Result: `initialUrl: '/scan/result'` with no session → Camera; the re-ranked order; answer chips; "Demo diagnosis"; the low-confidence variant makes Retake primary; **Retake → exactly one Camera in the scan stack, no Redirect fired**; See treatment plan → `/scan/treatment`; content in a ScrollView | `scan-flow.test.tsx` | Step 8; edges 4, 10, 14 |
| T19 | Save sheet: default "My plant"; spaces-only → Save disabled; 41 emoji pasted → 40 whole; "+ New room" adds a room; double-press Save → one plant; mocked insert failure → error text, sheet stays open | `SaveSheet.test.tsx` | Step 9; edges 6, 7, 8 |
| T20 | Feedback: Yes → "Thanks! Your answer is saved."; No → guesses = the other 2 + "Something else" → "Save my answer" → one row with the guess | `FeedbackSheet.test.tsx` | Step 10 |
| T21 | My Plants: empty state + "Scan a plant" → `/scan`; 2 plants → newest first, name, room, diagnosis; a fake-diagnosed plant shows "Demo" | `my-plants.test.tsx` | My Plants; edge 10 |
| T22 | End to end: Scan → photo → 3 answers → Save → pathname `/plants`, no scan screens left in the navigation state, Back does not reopen the scan, 1 plant + 1 scan row. Plus: feedback saved → Back to Camera → new photo → Save → 2 scan rows, the new plant's scan points at the new photo | `scan-flow.test.tsx` | Goal; navigation |
| T23 | Close before saving → 0 rows, temp photo deleted, camera source deleted | `scan-flow.test.tsx` | Edge 5 |
| T24 | Feedback, then a failing save → the photo exists, the scan row intact | `scan-flow.test.tsx` | Edge 12 |
| T25 | Feedback, Back to Questions, change an answer, Save → the stored scan has the new answers | `scan-flow.test.tsx` | Edge 13 |

### Manual checklist (Task 34)

- [ ] Android phone, Expo Go 58: camera preview, shutter, gallery, permission allow / deny / "Don't ask again" → Open Settings → grant → back in the app the camera starts
- [ ] iOS simulator: gallery path, permission sheet, **Save plant closes the modal and lands on My Plants** (overlay + `dismissTo` on native)
- [ ] Save sheet on an iPhone SE size with the keyboard open: the name field and "Save plant" stay visible
- [ ] **Photo orientation**: portrait and landscape shots from the camera and the gallery come out upright on Result and in My Plants
- [ ] **EXIF stripped**: a gallery photo with location → the saved file has no GPS (check with a dev log of the manipulator output's EXIF)
- [ ] No leftover files: after a scan, `cache/Camera`, `cache/ImagePicker` and `cache/scans` hold nothing from it (dev log)
- [ ] Kill the app on Questions → reopen → open Scan → `cache/scans/` is empty
- [ ] Save while My Plants is open in the background → no "database is locked"
- [ ] Returning from the background keeps the current step
- [ ] iPhone SE size + 200% text: Questions and Result scroll, buttons reachable
- [ ] Android Back on every step does what the spec says
- [ ] Airplane mode: the whole flow works
- [ ] After prebuild (or the manifest in a dev build): no `RECORD_AUDIO` / microphone permission
- [ ] With TalkBack and VoiceOver on, the final "Comparing likely causes" announcement on Analyzing is heard in full before the screen moves to Questions/Result (it may be cut off by the navigation)

---

## Risks

| Risk | Mitigation |
|---|---|
| The manipulator may not apply EXIF orientation (sideways photos), and the camera may report pre-rotation width/height, so "longest side" picks wrong | Manual check (Task 34). If wrong: render once to get the true size, then resize; or read `exif.Orientation` and `rotate()` first. T12 includes a swapped-dimensions case |
| `sql.js` differs from expo-sqlite (row types; one connection, so no locking) | The adapter exposes only the 5 methods used; the device check covers the real engine and locking |
| Native module mocks drift from the real APIs | Mocks are typed against the real packages' types, so `tsc` fails if shapes change |
| `router.dismissTo` / `replace` behave differently in jest `renderRouter` than on device | T22 checks the navigation state; the manual iOS + Android checks |
| A crash between the photo copy and the insert leaves an orphan file in `document/photos` | Accepted for now; list it in the break-test |
| Phone backups include the photos and database | Open question in the spec for Sanket |

---

## Gate 2

**Architecture**
- [x] Follows the existing patterns (routes in `src/app`, components in `src/components`, tokens only in `src/theme`, `@/` alias, tests in `__tests__`)
- [x] Each layer only calls the layers below it: routes → session / scan services → domain / storage / photos → theme. Persistence orchestration lives in `saveScan.ts`, not the route
- [x] Components are in the right directories (shared in `src/components`, feature-specific in `src/scan/components`, `src/plants/components`)

**Task breakdown**
- [x] All files to change are listed
- [x] All new files are listed with their locations
- [x] Each task is small (≤3 files, except task 21: 4 small presentational files, noted)
- [x] Dependencies between tasks are clear
- [x] Parallel vs sequential tasks are marked

**Testing**
- [x] Data layer tests planned (T9–T12)
- [x] Business logic tests planned (T2–T8, T13–T13c)
- [x] Integration tests planned (T16–T25 over the real route tree; no API in scope)
- [x] UI tests planned (T14, T15, T19–T21)
- [x] Edge cases from spec covered: 1 → T16a · 2 → T16b · 3 → T12, T13b + manual · 4 → T17, T18b · 5 → T13, T23 + manual · 6 → T7, T14, T16b, T19 · 7 → T8, T19 · 8 → T13c, T19 · 9 → T6, T13b, T17 · 10 → T4, T15, T17, T18, T21 · 11 → T18a/b (ScrollView) + manual · 12 → T13c, T24 · 13 → T10, T13c, T25 · 14 → T17, T18 · 15 → T16a · 16 → T10b

**Result: PASSED**
