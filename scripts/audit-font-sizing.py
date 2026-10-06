"""Audit the visible sizes of every selectable and legacy Strip font.

Run on macOS with fonttools[woff] installed. Prints JSON only, no file writes.
Measure outline tops, not the em square or the font's often unreliable OS/2
metadata. H measures capitals; x measures lowercase. Decorative descenders
remain intact but do not make an entire blackletter alphabet artificially tiny.
System faces are measured at the weights actually used by profile/text views.
"""
import hashlib
import json
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1]
system = Path("/System/Library/Fonts")
supplemental = system / "Supplemental"
faces = {
    "letter": (supplemental / "Arial Black.ttf", 0, 0),
    "sans": (system / "SFNS.ttf", 0, 0),
    "serif": (supplemental / "Iowan Old Style.ttc", 0, 1),
    "mono": (system / "SFNSMono.ttf", 0, 0),
    "rounded": (system / "SFNSRounded.ttf", 0, 0),
    "display": (supplemental / "Didot.ttc", 0, 2),
    "arial": (supplemental / "Arial.ttf", 0, 0),
    "times": (supplemental / "Times New Roman.ttf", 0, 0),
    "condensed": (system / "Avenir Next Condensed.ttc", 7, 0),
    "hand": (system / "Noteworthy.ttc", 0, 1),
}
for path in (root / "public/fonts").glob("*.woff2"):
    faces[path.stem] = (path, 0, 0)


def measure(path, index, weight):
    font = TTFont(path, fontNumber=index)
    if "fvar" in font:
        axes = {axis.axisTag for axis in font["fvar"].axes}
        location = {"wght": weight} if "wght" in axes else {}
        if "opsz" in axes:
            location["opsz"] = 17
        font = instantiateVariableFont(font, location, inplace=True)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    units = font["head"].unitsPerEm
    heights = []
    for character in "Hx":
        pen = BoundsPen(glyphs)
        glyphs[cmap[ord(character)]].draw(pen)
        heights.append(round(pen.bounds[3] / units, 6))
    font.close()
    return heights


audit = {}
for identifier, (path, text_index, title_index) in faces.items():
    title_path = path
    if identifier in ("arial", "times"):
        title_path = path.with_name(path.stem + " Bold.ttf")
    audit[identifier] = {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "source": path.name,
        "text": measure(path, text_index, 450),
        "title": measure(title_path, title_index, 700),
    }
print(json.dumps(audit, indent=2))
