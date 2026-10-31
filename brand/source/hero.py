"""Rebloom hero mark: the sprout-r drawn in Bricolage Grotesque units (upm 1000, y-up, wght 650).

Pieces (all y-up font units, origin at baseline/left of the r):
  BODY  – one continuous outline: stem → flat head → leaf upper edge → tip → leaf lower edge → fillet → stem
  VEIN  – tapered midrib slit (negative space) along the leaf axis
  LOWER – the lower half of the leaf (below the vein), used for the two-tone "fold"
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "fonts", "BricolageGrotesque[opsz,wdth,wght].ttf")
PY = sys.executable

# ---- geometry (font units) -------------------------------------------------
STEM_L, STEM_R, XH = 40, 175.5, 524          # matches Bricolage 'l'/'r' stem at wght 650
TIP = (500, 806)                              # leaf tip: above the ascender (692) — pointed overshoot

BODY = [
    ("M", (STEM_L, 0)),
    ("L", (STEM_L, XH)),
    ("C", (STEM_L, 690), (250, 800), TIP),              # the stem's left edge keeps rising and sweeps into the leaf
    ("C", (522, 690), (470, 556), (332, 482)),          # lower edge, belly down-right
    ("C", (240, 452), (STEM_R, 420), (STEM_R, 352)),    # soft crotch back into the stem
    ("L", (STEM_R, 0)),
    ("Z",),
]
VEIN = [  # midrib slit: a crescent pointed at both ends, widest just past the base
    ("M", (184, 552)),
    ("C", (270, 662), (370, 746), (472, 786)),
    ("C", (382, 724), (286, 634), (184, 552)),
    ("Z",),
]
LOWER = [  # lower half of the leaf (below the vein) for the two-tone fold
    ("M", (184, 552)),
    ("C", (286, 634), (382, 724), (472, 786)),
    ("L", TIP),
    ("C", (522, 690), (470, 556), (332, 482)),
    ("C", (240, 452), (STEM_R, 420), (STEM_R, 352)),
    ("L", (STEM_R, 540)),
    ("Z",),
]
R_ADV = 400          # advance of the sprout-r inside the word: 'e' tucks under the leaf
BBOX = (STEM_L, 0, 516, TIP[1])


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def path(cmds, s, ox, oy):
    """y-up font units -> y-down SVG at scale s with baseline origin (ox, oy)."""
    out = []
    for c in cmds:
        k, pts = c[0], c[1:]
        out.append(k + " ".join(f"{f(ox + x * s)} {f(oy - y * s)}" for x, y in pts))
    return " ".join(out)


def word(text, size, wght=650, font=FONT, close=7):
    r = subprocess.run([PY, "-I", os.path.join(HERE, "wordpath.py"), font, text, "--wght", str(wght),
                        "--size", str(size), "--close", str(close)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)
