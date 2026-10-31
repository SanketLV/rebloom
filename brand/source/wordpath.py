"""Outline a word in Bricolage Grotesque as SVG path data (y-down, baseline at 0, units = font units / upm * size).

usage: wordpath.py FONT TEXT --wght 650 --opsz 96 --wdth 100 --size 100 [--track 0] [--json]
Prints JSON {d, width, ascent(cap/x heights), glyphs:[{ch,x,adv,d}]} so callers can swap letters.
"""
import argparse, json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont, OverlapMode
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ap = argparse.ArgumentParser()
ap.add_argument("font"); ap.add_argument("text")
ap.add_argument("--wght", type=float, default=650); ap.add_argument("--opsz", type=float, default=96)
ap.add_argument("--wdth", type=float, default=100); ap.add_argument("--size", type=float, default=100)
ap.add_argument("--close", type=float, default=0, help="fill ink traps narrower than 2*CLOSE font units")
ap.add_argument("--track", type=float, default=0, help="extra spacing in output units")
a = ap.parse_args()

_t = TTFont(a.font)
_axes = {ax.axisTag for ax in _t["fvar"].axes}
f = instantiateVariableFont(_t, {k: v for k, v in {"wght": a.wght, "opsz": a.opsz, "wdth": a.wdth}.items() if k in _axes},
                            overlap=OverlapMode.REMOVE)
gs, cmap, upm = f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm
s = a.size / upm
os2 = f["OS/2"]
x, out = 0.0, []
for ch in a.text:
    g = cmap[ord(ch)]
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    src = gs[g]
    if a.close:
        import pathops
        p = pathops.Path(); src.draw(p.getPen())
        def grow(q, w):
            st = pathops.Path(q); st.stroke(w, pathops.LineCap.BUTT_CAP, pathops.LineJoin.ROUND_JOIN, 4); st.convertConicsToQuads()
            return st
        dil = pathops.op(p, grow(p, 2 * a.close), pathops.PathOp.UNION)
        p = pathops.op(dil, grow(dil, 2 * a.close), pathops.PathOp.DIFFERENCE)
        src = p
    src.draw(TransformPen(pen, (s, 0, 0, -s, x, 0)))
    adv = gs[g].width * s
    out.append({"ch": ch, "x": round(x, 2), "adv": round(adv, 2), "d": pen.getCommands()})
    x += adv + a.track
print(json.dumps({"d": " ".join(o["d"] for o in out), "width": round(x - a.track, 2),
                  "xHeight": os2.sxHeight * s, "capHeight": os2.sCapHeight * s,
                  "ascender": f["hhea"].ascent * s, "glyphs": out}))
