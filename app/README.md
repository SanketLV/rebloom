# Rebloom app

Expo SDK 58 · Expo Router · TypeScript (strict).

## Run

```bash
npm install
npx expo start     # scan the QR code with Expo Go, or press a / i / w
```

## Check

```bash
npm run typecheck
npm run lint
npm test
```

## Where things live

| Path | What |
|---|---|
| `src/app/` | Routes. `(tabs)/` holds Today and My Plants; `scan` is a full-screen modal; `settings` is pushed from the profile icon. |
| `src/components/TabBar.tsx` | Custom tab bar with the raised Scan button |
| `src/theme/tokens.ts` | Colors, radius, spacing, type styles. **The only file allowed to contain hex colors** (a test enforces this). |
| `src/theme/fonts.ts` | Bricolage Grotesque (headings) and Figtree (body). One family name per weight, because Android ignores `fontWeight` on custom fonts. |

Design source: the "Rebloom App Screens" canvas. Each placeholder screen names the artboard it becomes.

## Notes

- Light mode only (`userInterfaceStyle: "light"`) until dark mode is designed.
- Testing Library v14: `render` and `fireEvent` are async, so always `await` them.
- Keep test files out of `src/app/`; anything in there can become a route.
