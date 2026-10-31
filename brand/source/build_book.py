"""Generate brand/kit/brand-book.html with the mark inlined (split into stem / leaf / fold for the reveal).
Run with the venv python. usage: python build_book.py ../kit   (rebuilds the kit masters too)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hero as H
import pathops
from build_kit import to_path, clean  # noqa: E402  (build_kit regenerates the kit on import — cheap and keeps them in sync)

KIT = sys.argv[1]

# ---- mark pieces in font units, y flipped (viewBox below uses y-down by negating) ----
S, OX, OY = 1, 0, 0
body_d = H.path(H.BODY, 1, 0, 0) + " " + H.path(H.VEIN, 1, 0, 0)   # y-down: y -> -y (baseline at 0)
lower_d = H.path(H.LOWER, 1, 0, 0)
body = to_path(body_d, evenodd=True)


def rect(x0, y0, x1, y1):
    p = pathops.Path(); pen = p.getPen()
    pen.moveTo((x0, y0)); pen.lineTo((x1, y0)); pen.lineTo((x1, y1)); pen.lineTo((x0, y1)); pen.closePath()
    return p


OP = pathops.op
I, D = pathops.PathOp.INTERSECTION, pathops.PathOp.DIFFERENCE
stem = OP(body, rect(H.STEM_L, -640, H.STEM_R, 0), I)            # stem keeps a curved neck up to 640 (hidden under the leaf at rest)
leaf_all = OP(body, rect(H.STEM_L, -524, H.STEM_R, 0), D)        # everything above/right of the stem
fold = OP(OP(to_path(lower_d), body, I), rect(H.STEM_L, -524, H.STEM_R, 0), D)
leaf_upper = OP(leaf_all, fold, D)
STEM_D, LEAF_D, FOLD_D = clean(stem), clean(leaf_upper), clean(fold)
VB = "-20 -840 640 860"      # x 0..560, y -840..20 (font units, y-down)
PIVOT = (130, -604)       # the leaf bends at the neck

logo_svg = open(os.path.join(KIT, "logo", "rebloom-logo.svg"), encoding="utf-8").read()
logo_inner = logo_svg[logo_svg.index("</title>") + 8: logo_svg.rindex("</svg>")]
logo_vb = logo_svg.split('viewBox="')[1].split('"')[0]


def logo(fill_word, fill_mark=None, fold=None, cls="", label="Rebloom logo"):
    """Inline the primary logotype, recoloured."""
    inner = logo_inner.replace("#2E3D28", fill_word)
    return f'<svg class="{cls}" viewBox="{logo_vb}" role="img" aria-label="{label}">{inner}</svg>'


def mark_svg(stem_fill, leaf_fill, fold_fill, cls="", label="Rebloom symbol", ids=False):
    i = (lambda n: f' id="{n}"') if ids else (lambda n: "")
    return (f'<svg class="{cls}" viewBox="{VB}" role="img" aria-label="{label}">'
            f'<path{i("m-stem")} fill="{stem_fill}" d="{STEM_D}"/>'
            f'<g{i("m-leaf")} data-px="{PIVOT[0]}" data-py="{PIVOT[1]}">'
            f'<path{i("m-upper")} fill="{leaf_fill}" d="{LEAF_D}"/><path{i("m-fold")} fill="{fold_fill}" d="{FOLD_D}"/></g></svg>')


# construction drawing (font units)
def construction():
    lines = []
    def hl(y, label, x1=560):
        lines.append(f'<line x1="-40" x2="{x1}" y1="{-y}" y2="{-y}" class="c-line"/>'
                     f'<text x="{x1 + 14}" y="{-y + 9}" class="c-label">{label}</text>')
    hl(0, "Baseline"); hl(524, "x-height 524"); hl(692, "Ascender of b and l, 692"); hl(806, "Leaf tip, 806")
    lines.append(f'<line x1="{H.STEM_L}" x2="{H.STEM_R}" y1="70" y2="70" class="c-dim"/>'
                 f'<line x1="{H.STEM_L}" x2="{H.STEM_L}" y1="56" y2="84" class="c-dim"/>'
                 f'<line x1="{H.STEM_R}" x2="{H.STEM_R}" y1="56" y2="84" class="c-dim"/>'
                 f'<text x="{(H.STEM_L + H.STEM_R) / 2}" y="122" text-anchor="middle" class="c-label">Stem 135.5</text>')
    return (f'<svg class="construct" viewBox="-60 -880 1060 1040" role="img" aria-label="Construction of the sprout r">'
            + "".join(lines) +
            f'<path class="c-mark" fill-rule="nonzero" d="{STEM_D} {LEAF_D} {FOLD_D}"/>'
            f'<path class="c-skel" d="{H.path(H.VEIN, 1, 0, 0)}"/>'
            f'<circle cx="{PIVOT[0]}" cy="{PIVOT[1]}" r="9" class="c-pt"/>'
            '</svg>')


PALETTE = [  # name, hex, role, share
    ("Soft White", "#E8E9DF", "Pages and app background", 46),
    ("Surface", "#FAFAF5", "Cards, sheets, the mark on olive", 16),
    ("Deep Olive", "#2E3D28", "The logo, primary buttons, hero grounds", 22),
    ("Sage", "#A9B887", "Chips, icon grounds, quiet accents", 8),
    ("Walnut", "#5A3E2B", "Day-7 check-ins and treatment steps", 4),
    ("Amber tint", "#F2DFC2", "Check-in cards, the promise", 2),
    ("Lime", "#BFE23A", "Wins only: the leaf on dark, recoveries, streaks", 2),
]


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def cmyk(h):
    r, g, b = (v / 255 for v in rgb(h))
    k = 1 - max(r, g, b)
    if k >= 1:
        return (0, 0, 0, 100)
    return tuple(round(100 * x) for x in ((1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k))


swatches = "".join(
    f'<li class="sw" style="--c:{hx};--w:{min(100, 30 + share * 1.5):.0f}%"><span class="sw-chip" data-dark="{1 if sum(rgb(hx)) < 360 else 0}">'
    f'<b>{name}</b></span><span class="sw-meta"><span>{hx}</span><span>RGB {", ".join(map(str, rgb(hx)))}</span>'
    f'<span>CMYK {" ".join(map(str, cmyk(hx)))}</span><span class="sw-role">{role}</span></span></li>'
    for name, hx, role, share in PALETTE)

files = [
    ("logo/rebloom-logo.svg", "Logo", "Deep Olive, for light backgrounds"),
    ("logo/rebloom-logo-bloom.svg", "Logo, bloom", "Surface and Lime, for Deep Olive"),
    ("logo/rebloom-logo-white.svg", "Logo, white", "Slightly thinned for dark photos"),
    ("logo/rebloom-logo-black.svg", "Logo, black", "Single-colour print, stamps, fax"),
    ("logo/rebloom-logo-descriptor.svg", "Logo with descriptor", "Store pages, press, first contact"),
    ("logo/rebloom-symbol.svg", "Symbol", "Avatars and anywhere the name is already present"),
    ("logo/rebloom-symbol-small.svg", "Symbol, small cut", "No vein; use at 32 px and below"),
    ("app-icon/rebloom-app-icon.svg", "App icon", "Store artwork and presentations"),
    ("expo/", "Expo icon set", "Drop-in replacements for app/assets/images"),
    ("web/", "Web icons", "favicon.ico, SVG favicon, PWA icons, manifest, head snippet"),
    ("png/", "PNG exports", "Every logo and symbol, transparent"),
    ("social/", "Social", "Profile picture and link-preview image"),
    ("motion/", "Motion", "Logo reveal in 16:9, 1:1 and 9:16, and the Day 1 to Day 7 recovery (MP4, 60 fps)"),
]
file_rows = "".join(f'<li><a href="{p}">{n}</a><span>{d}</span></li>' for p, n, d in files)

misuse = [
    ("rotate", "Don't tilt it. The leaf already brings the movement."),
    ("stretch", "Don't stretch or squash it."),
    ("lime", "Don't set it in Lime on a light ground; it disappears."),
    ("outline", "Don't outline it."),
    ("shadow", "Don't add shadows, glows or gradients."),
    ("swap", "Don't set the symbol beside the logo. The r already is the symbol."),
]
misuse_html = "".join(
    f'<figure class="dont dont-{k}"><div class="dont-art">'
    + (mark_svg("#2E3D28", "#2E3D28", "#2E3D28", "swap-sym") if k == "swap" else "")
    + logo("#BFE23A" if k == "lime" else "#2E3D28", cls="dont-logo")
    + f'</div><figcaption>{t}</figcaption></figure>' for k, t in misuse)

import re as _re
_vb = [float(v) for v in logo_vb.split()]
_pad = H.STEM_R - H.STEM_L
UX, UY = 100 * _pad * 0.2 / _vb[2], 100 * _pad * 0.2 / _vb[3]
html = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "book_template.html"), encoding="utf-8").read()
html = (html.replace("{{LOGO_OLIVE}}", logo("#2E3D28", cls="logo-lg"))
        .replace("{{LOGO_CREAM}}", open(os.path.join(KIT, "logo", "rebloom-logo-bloom.svg"), encoding="utf-8").read().split("?>")[-1])
        .replace("{{LOGO_DESC}}", open(os.path.join(KIT, "logo", "rebloom-logo-descriptor.svg"), encoding="utf-8").read())
        .replace("{{LOGO_SMALL}}", logo("#2E3D28", cls="logo-min"))
        .replace("{{LOGO_SPACE}}", logo("#2E3D28", cls="logo-space"))
        .replace("{{SYMBOL}}", mark_svg("#2E3D28", "#2E3D28", "#2E3D28", "sym"))
        .replace("{{CONSTRUCT}}", construction())
        .replace("{{SWATCHES}}", swatches)
        .replace("{{MISUSE}}", misuse_html)
        .replace("{{FILES}}", file_rows).replace("{{UX}}", f"{UX:.2f}%").replace("{{UY}}", f"{UY:.2f}%"))
with open(os.path.join(KIT, "brand-book.html"), "w", encoding="utf-8") as fh:
    fh.write(html)
print("book ok")
