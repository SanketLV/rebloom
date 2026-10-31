# Rebloom app

Expo SDK 58 · Expo Router · TypeScript (strict). Android and iOS only: the local SQLite database needs extra setup on web, so `npm run web` isn't supported.

## Run

```bash
npm install
npx expo start     # scan the QR code with Expo Go, or press a / i
```

Everything the scan flow uses (camera, image picker, image manipulator, SQLite, file system) ships in Expo Go 58, so no dev build is needed yet.

## Check

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

## Where things live

| Path | What |
|---|---|
| `src/app/` | Routes. `(tabs)/` holds Today and My Plants; `scan/` is a full-screen modal with its own stack (camera → analyzing → questions → result); `settings` is pushed from the profile icon. |
| `src/diagnosis/` | The `Diagnoser` interface, the condition catalogue, the follow-up questions and the answer re-ranking rules. `engine.ts` is the one place to swap in the on-device model. |
| `src/scan/` | The scan session (one scan's photo, diagnosis and answers; deletes its temp files), the diagnosis runner and the save services. |
| `src/storage/` | SQLite schema (`migrations.ts`) and repositories. Every value is a bound parameter. |
| `src/photos/` | Resizing, the temp folder (`cache/scans/`) and permanent photos (`document/photos/`). |
| `src/components/TabBar.tsx` | Custom tab bar with the raised Scan button |
| `src/theme/tokens.ts` | Colors, radius, spacing, type styles. **The only file allowed to contain hex colors** (a test enforces this). |
| `src/theme/fonts.ts` | Bricolage Grotesque (headings) and Figtree (body). One family name per weight, because Android ignores `fontWeight` on custom fonts. |
| `src/testing/` | Test-only fakes for the native modules (see below). Never imported by app code. |

Design source: the "Rebloom App Screens" canvas. Each placeholder screen names the artboard it becomes.

## The fake diagnoser

Until the on-device model is ready, `fakeDiagnoser` gives realistic, repeatable results (the same photo always gets the same answer; about 1 in 4 comes out low-confidence). Anything it produces carries a **Demo** tag on Analyzing, Questions, Result and My Plants, so a demo result is never mistaken for a real one.

## Tests and native modules

Native modules don't run in jest, so `jest.setup.ts` swaps in the fakes from `src/testing/`:

- **SQLite**: a real SQLite engine (sql.js, WebAssembly) behind the same methods the app uses, so migrations and queries run for real. It has one connection, so "database is locked" can only show up on a device.
- **File system**: an in-memory `File` / `Directory` / `Paths` that can fail on demand (`fakeFs.failNext('copy')`).
- **Camera, image picker, image manipulator, crypto**: controllable through `mockCamera`, `mockPicker`, `mockManipulator`, `mockSqlite` in `src/testing/nativeMocks.ts`.

## Notes

- Light mode only (`userInterfaceStyle: "light"`) until dark mode is designed.
- Testing Library v14: `render` and `fireEvent` are async, so always `await` them.
- Keep test files out of `src/app/`; anything in there can become a route.
- Text lengths (plant name, room) count code points, not UTF-16 units: don't use `TextInput maxLength`, which can cut an emoji in half.
- Formatting: `npx prettier --single-quote --print-width 100 --bracket-same-line`.
