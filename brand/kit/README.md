# Rebloom brand kit, version 1

Open `brand-book.html` for the full guidelines. The hero plays a pre-rendered video; for autoplay to work everywhere, serve the folder
(`python -m http.server --directory brand/kit`, or the `brand-book` preview in `.claude/launch.json`).

| Folder | What's inside |
|---|---|
| `logo/` | Outlined SVG masters: logo, logo with descriptor, symbol, small-cut symbol. Colour, black, white and bloom (cream + lime, for Deep Olive) versions |
| `png/` | Transparent PNGs of every logo and symbol, plus the social images |
| `app-icon/` | App icon SVGs: rounded master, full-bleed square, Android adaptive layers, splash |
| `expo/` | Drop-in replacements for `app/assets/images` (same names and sizes) |
| `web/` | `favicon.ico`, SVG favicon, Apple touch and PWA icons, `site.webmanifest`, `head-snippet.html` |
| `social/` | Profile picture (circle-safe) and 1200 × 630 link preview |
| `motion/` | Logo reveal (16:9, 1:1, 9:16) and the Day 1 → Day 7 recovery, MP4 at 60 fps. Made in `brand/motion` (Remotion) |

## Notes for whoever picks this up

- The white and bloom versions are thinned by 3 % of the stem weight, because light shapes on dark grounds look heavier.
- The logotype keeps Bricolage Grotesque's small ink-trap notches and its slanted `e` bar on purpose; the long, crack-like slivers were closed.
- CMYK values in the brand book are straight conversions from the screen colours. Get a printer's proof before any print run. No Pantone matches yet.
- iOS uses `app/assets/expo.icon` (an Icon Composer file). Rebuild it in Icon Composer from `app-icon/android-icon-foreground.svg` on a Deep Olive fill; it can't be generated from here.
- Trademark: "Rebloom" still needs a search in the software and plant-care classes before launch.
