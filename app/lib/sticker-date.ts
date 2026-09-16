// Hand-drawn numeral strokes. Reusing paths on paper and in the CSS fallback
// keeps the handwriting consistent without waiting for a downloaded font.
const digits: Record<string, string> = {
  "0": "M12 3 C3 -1 0 11 2 19 C4 27 12 24 14 15 C16 8 16 3 12 3",
  "1": "M3 8 Q7 5 10 2 L8 24",
  "2": "M2 6 C6 -1 17 1 14 9 C12 14 3 18 1 23 Q9 22 15 24",
  "3": "M2 4 Q10 0 14 4 Q17 10 8 12 C18 10 18 22 8 24 Q3 24 1 21",
  "4": "M11 1 Q6 10 1 15 L16 15 M12 7 L10 25",
  "5": "M15 2 L4 3 L2 13 C10 9 18 14 13 21 Q8 27 1 22",
  "6": "M13 1 C6 4 0 12 2 20 C5 29 16 23 14 16 Q12 10 3 15",
  "7": "M1 3 Q9 1 16 2 Q9 12 6 24",
  "8": "M8 12 C-3 7 5 -2 12 3 C20 9 4 12 2 17 C-2 27 15 27 15 19 Q14 15 8 12",
  "9": "M13 13 C3 20 -2 6 6 2 C17 -3 18 13 8 24",
  "/": "M9 1 Q4 12 0 26",
};

export function stickerDate(publishedAt?: number) {
  if (!publishedAt || !Number.isFinite(publishedAt)) return "";
  const date = new Date(publishedAt);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${String(date.getUTCFullYear()).slice(-2)}`;
}

export function markerDateStrokes(date: string) {
  let x = 0;
  return [...date].filter(character => digits[character]).map((character, index) => {
    const value = { path: digits[character], x, y: Math.sin(index * 2.7) * 1.1,
      rotation: Math.sin(index * 1.6) * 3.2, width: 3.2 + Math.sin(index * 2.1) * .35 };
    x += character === "/" ? 13 : 20;
    return value;
  });
}

export function paintStickerDate(context: CanvasRenderingContext2D, date: string, width: number, height: number) {
  if (!date) return;
  const strokes = markerDateStrokes(date), lineWidth = strokes.at(-1)!.x + 19;
  const scale = Math.min(width * .39 / lineWidth, height * .14 / 28);
  context.save();
  context.translate(width * .93 - lineWidth * scale, height * .92 - 27 * scale);
  context.rotate(-.055); context.scale(scale, scale);
  context.lineCap = "round"; context.lineJoin = "round";
  for (const [index, stroke] of strokes.entries()) {
    context.save(); context.translate(stroke.x, stroke.y); context.rotate(stroke.rotation * Math.PI / 180);
    const path = new Path2D(stroke.path);
    // A soft absorbent edge, then a broad pressure-varying felt nib.
    context.strokeStyle = "rgba(24, 23, 20, 0.22)";
    context.lineWidth = stroke.width + .7; context.stroke(path);
    const guide = document.createElementNS("http://www.w3.org/2000/svg", "path");
    guide.setAttribute("d", stroke.path);
    const length = guide.getTotalLength();
    context.strokeStyle = "rgba(22, 21, 19, 0.96)";
    for (let distance = 0; distance < length; distance += 1.2) {
      const a = guide.getPointAtLength(distance), b = guide.getPointAtLength(Math.min(length, distance + 1.4));
      context.lineWidth = stroke.width * (.94 + .13 * Math.sin(distance * .24 + index));
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
    // Dry felt leaves tiny, irregular paper-colored tracks inside the ink.
    context.strokeStyle = "rgba(219, 214, 198, 0.17)"; context.lineWidth = .18;
    for (let distance = 3; distance < length - 2; distance += 7.7) {
      const a = guide.getPointAtLength(distance), b = guide.getPointAtLength(distance + 2.2);
      context.beginPath(); context.moveTo(a.x + .5, a.y); context.lineTo(b.x + .5, b.y); context.stroke();
    }
    context.restore();
  }
  context.restore();
}
