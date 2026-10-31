# Rebloom logo source

The sprout-r is drawn in `hero.py` in Bricolage Grotesque's own units (1000 per em, wght 650), so it shares the
font's stem width. Everything in `../kit` is generated from it.

```bash
python -m pip install fonttools skia-pathops
python build_book.py ../kit    # rebuilds the SVG masters, then brand-book.html
python export_motion.py ../motion/src/geometry.ts   # feeds the Remotion animations
```

PNG exports, the Expo icon set and web icons were rendered from those SVGs with the `logo-design` skill's
`render_png.py` and `export_variants.py`.

Fonts are from Google Fonts under the SIL Open Font License.
