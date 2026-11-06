# Writes smaller -<width>.webp versions next to each in-page photo. Run once per new or changed photo, then commit:
#   python landing/scripts/make-photo-variants.py
# Hero and closing photos are art-directed and already small, so they have no variants.
from pathlib import Path
from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / 'public' / 'assets'
# Same widths as src/lib/photos.ts. The recovery photos sit in a narrower column, so their middle size is smaller.
PHOTOS = {name: (480, 720) for name in ['sym-tips', 'sym-yellow', 'sym-mildew', 'sym-mites', 'step-scan', 'step-answer', 'step-treat', 'promise']}
PHOTOS |= {name: (480, 600) for name in ['day1', 'day7']}

for name, widths in PHOTOS.items():
    src = ASSETS / f'{name}.webp'
    for width in widths:
        out = ASSETS / f'{name}-{width}.webp'
        with Image.open(src) as image:
            height = round(image.height * width / image.width)
            image.convert('RGB').resize((width, height), Image.LANCZOS).save(out, 'WEBP', quality=78, method=6)
        before, after = src.stat().st_size, out.stat().st_size
        print(f'{out.name}: {before // 1024} KB -> {after // 1024} KB ({width}x{height})')
        if after >= before:
            raise SystemExit(f'{out.name} is not smaller than {src.name}')
