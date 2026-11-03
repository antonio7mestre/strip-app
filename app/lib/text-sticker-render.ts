import { normalizedFontSize } from "./font-sizing";
import { profileFontInfo, profileFontWeight } from "./profile";
import { normalizeTextSticker, TEXT_STICKER_WIDTH, TEXT_STICKER_PADDING, type TextSticker } from "./text-sticker";

type TextStickerRow = { text: string; start: number; end: number };
export type TextStickerCaret = { x: number; y: number; height: number };

/** Keep source offsets alongside the exact painted lines, including trimmed
 * wrap spaces. The cursor must use this layout, not a second browser layout. */
export function textStickerRows(context: Pick<CanvasRenderingContext2D, "measureText">, text: string, width: number) {
  const rows: TextStickerRow[] = [];
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let paragraphStart = 0;
  for (const paragraph of text.split("\n")) {
    let line = "";
    let start = paragraphStart;
    const push = () => {
      const painted = line.trimEnd();
      rows.push({ text: painted, start, end: start + painted.length });
      line = "";
    };
    for (const match of paragraph.matchAll(/\S+|\s+/gu)) {
      const word = match[0], wordStart = paragraphStart + match.index;
      if (line && context.measureText(line + word).width > width && !/^\s+$/u.test(word)) {
        push();
      }
      if (context.measureText(word).width > width) {
        for (const { segment, index } of segments.segment(word)) {
          if (line && context.measureText(line + segment).width > width) push();
          if (!line) start = wordStart + index;
          line += segment;
        }
      } else {
        const part = line ? word : word.trimStart();
        if (!line) start = wordStart + word.length - part.length;
        line += part;
      }
    }
    push();
    paragraphStart += paragraph.length + 1;
  }
  return rows;
}

/** Keep emoji sequences intact when wrapping a word longer than the sticker. */
export function textStickerLines(context: Pick<CanvasRenderingContext2D, "measureText">, text: string, width: number) {
  return textStickerRows(context, text, width).map(row => row.text);
}

export function textStickerCarets(context: Pick<CanvasRenderingContext2D, "measureText">, rows: TextStickerRow[],
  data: TextSticker, paddingTop: number, leading: number): TextStickerCaret[] {
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const boundaries = [0, ...Array.from(segments.segment(data.content), part => part.index + part.segment.length)];
  let rowIndex = 0, boundaryIndex = 0;
  return Array.from({ length: data.content.length + 1 }, (_, offset) => {
    while (boundaries[boundaryIndex + 1] <= offset) boundaryIndex++;
    const index = boundaries[boundaryIndex];
    while (rows[rowIndex + 1] && rows[rowIndex + 1].start <= index) rowIndex++;
    const row = rows[rowIndex];
    const lineWidth = context.measureText(row.text).width;
    const left = data.textAlign === "center" ? (TEXT_STICKER_WIDTH - lineWidth) / 2
      : data.textAlign === "right" ? TEXT_STICKER_WIDTH - TEXT_STICKER_PADDING - lineWidth : TEXT_STICKER_PADDING;
    const prefix = row.text.slice(0, Math.max(0, Math.min(index, row.end) - row.start));
    return { x: left + context.measureText(prefix).width, y: paddingTop + rowIndex * leading, height: leading };
  });
}

export function textStickerFont(data: TextSticker) {
  return `${profileFontWeight(data.fontStyle) ?? 450} ${normalizedFontSize(data.fontStyle, data.fontSize)}px ${profileFontInfo(data.fontStyle).family}`;
}

export async function paintTextSticker(canvas: HTMLCanvasElement, input: TextSticker, includeCarets = false) {
  const data = normalizeTextSticker(input)!;
  const font = textStickerFont(data);
  await document.fonts.load(font, data.content || "Aa");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Text drawing is unavailable.");
  context.font = font;
  const rows = textStickerRows(context, data.content, TEXT_STICKER_WIDTH - TEXT_STICKER_PADDING * 2);
  const lines = rows.map(row => row.text);
  const leading = Math.max(data.fontSize * 1.22, normalizedFontSize(data.fontStyle, data.fontSize) * 1.12);
  const metrics = context.measureText(data.content || "Ag");
  const ascent = metrics.fontBoundingBoxAscent || data.fontSize * .85;
  const descent = metrics.fontBoundingBoxDescent || data.fontSize * .25;
  // Match the native textarea's line box so entering/leaving typing does not
  // move the words. Extra padding protects display-font accents/descenders.
  const baseline = (leading - ascent - descent) / 2 + ascent;
  const paddingTop = TEXT_STICKER_PADDING + Math.max(0, (metrics.actualBoundingBoxAscent || 0) - baseline);
  const paddingBottom = TEXT_STICKER_PADDING + Math.max(0, (metrics.actualBoundingBoxDescent || 0) - (leading - baseline));
  const height = Math.ceil(paddingTop + paddingBottom + lines.length * leading);
  // One sharp rectangle shared by every line, sized to the longest one.
  const backgroundWidth = Math.min(TEXT_STICKER_WIDTH, Math.max(0, ...lines.map(line => context.measureText(line).width)) + TEXT_STICKER_PADDING * 2);
  const backgroundX = data.textAlign === "center" ? (TEXT_STICKER_WIDTH - backgroundWidth) / 2 : data.textAlign === "right" ? TEXT_STICKER_WIDTH - backgroundWidth : 0;
  const firstLineWidth = context.measureText(lines[0] ?? "").width;
  const firstLineX = data.textAlign === "center" ? (TEXT_STICKER_WIDTH - firstLineWidth) / 2 : data.textAlign === "right" ? TEXT_STICKER_WIDTH - TEXT_STICKER_PADDING - firstLineWidth : TEXT_STICKER_PADDING;
  const resolution = Math.min(3, 4096 / Math.max(TEXT_STICKER_WIDTH, height));
  canvas.width = Math.ceil(TEXT_STICKER_WIDTH * resolution);
  canvas.height = Math.ceil(height * resolution);
  context.scale(resolution, resolution);
  context.font = font;
  if (data.backgroundColor) {
    context.fillStyle = data.backgroundColor;
    context.fillRect(backgroundX, 0, backgroundWidth, height);
  }
  context.fillStyle = data.textColor;
  context.textAlign = data.textAlign;
  context.textBaseline = "alphabetic";
  const x = data.textAlign === "center" ? TEXT_STICKER_WIDTH / 2 : data.textAlign === "right" ? TEXT_STICKER_WIDTH - TEXT_STICKER_PADDING : TEXT_STICKER_PADDING;
  lines.forEach((line, i) => context.fillText(line, x, paddingTop + baseline + i * leading));
  const carets = includeCarets ? textStickerCarets(context, rows, data, paddingTop, leading) : undefined;
  return { height, leading, ascent, paddingTop, paddingBottom, backgroundX, backgroundWidth, firstLineX, carets };
}

const images = new Map<string, Promise<string>>();
export function renderTextSticker(input: TextSticker) {
  const data = normalizeTextSticker(input)!;
  const key = JSON.stringify(data);
  const cached = images.get(key);
  if (cached) return cached;
  const task = (async () => {
    const canvas = document.createElement("canvas");
    await paintTextSticker(canvas, data);
    return canvas.toDataURL("image/png");
  })();
  images.set(key, task);
  if (images.size > 24) images.delete(images.keys().next().value!);
  void task.catch(() => images.delete(key));
  return task;
}
