"""Verify real upper/lowercase glyphs. Run with fonttools[woff] installed.

Prints a hash-bound audit for tests/fixtures/profile-font-glyphs.json. No app
dependency or file writes. Example: python3 scripts/audit-profile-font-cases.py
"""
import hashlib
import json
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont


root = Path(__file__).resolve().parents[1]
results = {}
for path in sorted((root / "public/fonts").glob("*.woff2")):
    font = TTFont(path)
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()

    def outline(code):
        pen = DecomposingRecordingPen(glyphs)
        glyphs[cmap[code]].draw(pen)
        return pen.value

    uppercase = all(code in cmap for code in range(65, 91))
    lowercase = all(code in cmap for code in range(97, 123))
    distinct_pairs = sum(
        outline(code) != outline(code + 32)
        for code in range(65, 91)
        if code in cmap and code + 32 in cmap
    )
    results[path.stem] = {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "uppercase": uppercase,
        "lowercase": lowercase,
        "distinctPairs": distinct_pairs,
    }
    font.close()

print(json.dumps(results, indent=2))
