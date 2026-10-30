"""Build the Rebloom logo kit masters (SVG). Run with the venv python (needs fontTools + skia-pathops).
usage: python build_kit.py ../kit   (needs: pip install fonttools skia-pathops)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hero as H
import pathops
from fontTools.svgLib.path import parse_path
from fontTools.pens.svgPathPen import SVGPathPen

KIT = sys.argv[1]
FIGTREE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "Figtree[wght].ttf")
OLIVE, CREAM, LIME, SOFT, BLACK, WHITE = "#2E3D28", "#FAFAF5", "#BFE23A", "#E8E9DF", "#000000", "#FFFFFF"


# ---------- geometry helpers ------------------------------------------------
def to_path(d, evenodd=False):
    p = pathops.Path()
    parse_path(d, p.getPen())
    if evenodd:
        p.fillType = pathops.FillType.EVEN_ODD
    return p


def clean(p, thin=0.0):
    """Merge overlaps into one outline (nonzero); optionally erode by `thin` units (reversed versions)."""
    p = pathops.simplify(p)
    if thin:
        st = pathops.Path(p)
        st.stroke(2 * thin, pathops.LineCap.BUTT_CAP, pathops.LineJoin.ROUND_JOIN, 4)
        st.convertConicsToQuads()
        p = pathops.op(p, st, pathops.PathOp.DIFFERENCE)
    pen = SVGPathPen(None, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    p.draw(pen)
    return pen.getCommands()


def mark_paths(s, ox, oy, vein=True):
    body = H.path(H.BODY, s, ox, oy) + (" " + H.path(H.VEIN, s, ox, oy) if vein else "")
    return body, H.path(H.LOWER, s, ox, oy)


def svg(rel, body, w, h, title="Rebloom logo"):
    path = os.path.join(KIT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {H.f(w)} {H.f(h)}" width="{H.f(w)}" '
                 f'height="{H.f(h)}" role="img" aria-labelledby="title"><title id="title">{title}</title>\n{body}\n</svg>\n')


def place(box, fill, lift=0.02):
    x0, y0, x1, y1 = H.BBOX
    s = box * fill / max(x1 - x0, y1 - y0)
    ox = (box - (x1 - x0) * s) / 2 - x0 * s
    oy = box - (box - (y1 - y0) * s) / 2 + y0 * s - box * lift
    return s, ox, oy


def paint(body_d, lower_d, colour, fold=None, thin=0.0):
    """One-colour mark, or two-tone 'fold' (body colour + lower leaf half in `fold`)."""
    body = to_path(body_d, evenodd=True)
    if not fold:
        return f'<path fill="{colour}" d="{clean(body, thin)}"/>'
    lower = pathops.op(to_path(lower_d), body, pathops.PathOp.INTERSECTION)   # stays clear of the vein
    upper = pathops.op(body, lower, pathops.PathOp.DIFFERENCE)
    return f'<path fill="{colour}" d="{clean(upper, thin)}"/><path fill="{fold}" d="{clean(lower, thin)}"/>'


STEM = H.STEM_R - H.STEM_L          # 135.5 font units: the clear-space unit
THIN = STEM * 0.015                 # reversed versions lose 3 % of stem weight (irradiation)

# ---------- symbol ------------------------------------------------------------
s, ox, oy = place(256, 0.84)
b, lo = mark_paths(s, ox, oy)
bs, _ = mark_paths(s, ox, oy, vein=False)
t = THIN * s
svg("logo/rebloom-symbol.svg", paint(b, lo, OLIVE), 256, 256, "Rebloom symbol")
svg("logo/rebloom-symbol-black.svg", paint(b, lo, BLACK), 256, 256, "Rebloom symbol")
svg("logo/rebloom-symbol-white.svg", paint(b, lo, WHITE, thin=t), 256, 256, "Rebloom symbol")
svg("logo/rebloom-symbol-bloom.svg", paint(b, lo, CREAM, LIME, thin=t), 256, 256, "Rebloom symbol")
svg("logo/rebloom-symbol-small.svg", paint(bs, lo, OLIVE), 256, 256, "Rebloom symbol")

# ---------- logotype: sprout-r + 'ebloom' on one baseline -------------------
SIZE = 200
k = SIZE / 1000
W = H.word("ebloom", SIZE)
pad = STEM * k                                    # clear space = one stem width, built into the file
top = 806 * k                                     # leaf tip height
base = pad + top
wx = pad + H.R_ADV * k
LW, LH = wx + W["width"] + pad, base + pad
lb, ll = mark_paths(k, pad, base)
word_d = " ".join(f"{g['d']}" for g in W["glyphs"])


def word_at(colour, thin=0.0):
    p = to_path(word_d)
    p = p.transform(1, 0, 0, 1, wx, base)
    return f'<path fill="{colour}" d="{clean(p, thin)}"/>'


tk = THIN * k
for name, col, fold, th in [("", OLIVE, None, 0), ("-black", BLACK, None, 0), ("-white", WHITE, None, tk),
                            ("-bloom", CREAM, LIME, tk)]:
    svg(f"logo/rebloom-logo{name}.svg", paint(lb, ll, col, fold, th) + word_at(col, th), LW, LH, "Rebloom")

# ---------- logotype + descriptor -------------------------------------------
D = H.word("Plant doctor", 74, wght=600, font=FIGTREE, close=0)
dy = base + 0.42 * SIZE                           # descriptor baseline, 0.42 em under the word
DH = dy + pad


def desc_at(colour):
    p = to_path(" ".join(g["d"] for g in D["glyphs"])).transform(1, 0, 0, 1, wx + 6, dy)
    return f'<path fill="{colour}" d="{clean(p)}"/>'


for name, col, fold, th in [("", OLIVE, None, 0), ("-white", WHITE, None, tk), ("-bloom", CREAM, LIME, tk)]:
    dcol = LIME if fold else col
    svg(f"logo/rebloom-logo-descriptor{name}.svg",
        paint(lb, ll, col, fold, th) + word_at(col, th) + desc_at(dcol if name != "-bloom" else "#A9B887"),
        LW, DH, "Rebloom: Plant doctor")

# ---------- app icon (iOS-style master with rounded tile) + full-bleed square ----------
si, oxi, oyi = place(1024, 0.6, 0.025)
ab, al = mark_paths(si, oxi, oyi)
mark_icon = paint(ab, al, CREAM, LIME, thin=THIN * si)
svg("app-icon/rebloom-app-icon.svg", f'<rect width="1024" height="1024" rx="228" fill="{OLIVE}"/>{mark_icon}',
    1024, 1024, "Rebloom app icon")
svg("app-icon/rebloom-app-icon-square.svg", f'<rect width="1024" height="1024" fill="{OLIVE}"/>{mark_icon}',
    1024, 1024, "Rebloom app icon")
# Android adaptive: content must sit inside the central 66 % safe zone of a 108dp canvas
sa, oxa, oya = place(1024, 0.42, 0.02)
fb, fl = mark_paths(sa, oxa, oya)
svg("app-icon/android-icon-foreground.svg", paint(fb, fl, CREAM, LIME, thin=THIN * sa), 1024, 1024, "Rebloom")
svg("app-icon/android-icon-background.svg", f'<rect width="1024" height="1024" fill="{OLIVE}"/>', 1024, 1024, "Rebloom")
fbs, _ = mark_paths(sa, oxa, oya, vein=False)
svg("app-icon/android-icon-monochrome.svg", paint(fbs, fl, BLACK), 1024, 1024, "Rebloom")
ss, oxs, oys = place(1024, 0.9, 0.0)
sb, sl = mark_paths(ss, oxs, oys)
svg("app-icon/splash-icon.svg", paint(sb, sl, OLIVE), 1024, 1024, "Rebloom")

# ---------- social ---------------------------------------------------------------
sv, oxv, oyv = place(1080, 0.5, 0.01)              # circle-crop safe
vb, vl = mark_paths(sv, oxv, oyv)
svg("social/avatar.svg", f'<rect width="1080" height="1080" fill="{OLIVE}"/>' + paint(vb, vl, CREAM, LIME, THIN * sv),
    1080, 1080, "Rebloom")
og_s = 1200 * 0.62 / LW
og_body = paint(lb, ll, CREAM, LIME, tk) + word_at(CREAM, tk)
svg("social/og-image.svg",
    f'<rect width="1200" height="630" fill="{OLIVE}"/><g transform="translate({H.f((1200 - LW * og_s) / 2)} '
    f'{H.f((630 - LH * og_s) / 2 - 10)}) scale({H.f(og_s)})">{og_body}</g>', 1200, 630, "Rebloom")
print("kit ok", KIT, "logotype", round(LW, 1), "x", round(LH, 1))

# ---------- favicon: olive tile + cream small-cut mark (reads in a crowded tab bar) ----------
sf, oxf, oyf = place(64, 0.78, 0.015)
fvb, fvl = mark_paths(sf, oxf, oyf, vein=False)
svg("web/favicon.svg", f'<rect width="64" height="64" rx="14" fill="{OLIVE}"/>' + paint(fvb, fvl, CREAM, thin=THIN * sf),
    64, 64, "Rebloom")
print("favicon ok")
