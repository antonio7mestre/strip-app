import { normalizedFontSize } from "./font-sizing";
import { profileFontInfo, profileFontWeight } from "./profile";
import { normalizeTextSticker, TEXT_STICKER_WIDTH, TEXT_STICKER_PADDING, type TextSticker } from "./text-sticker";

/** Keep emoji sequences intact when wrapping a word longer than the sticker. */
export function textStickerLines(context: Pick<CanvasRenderingContext2D, "measureText">, text: string, width: number) {
  const lines: string[] = [];
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.match(/\S+|\s+/gu) ?? []) {
      if (line && context.measureText(line + word).width > width && !/^\s+$/u.test(word)) {
        lines.push(line.trimEnd()); line = "";
      }
      if (context.measureText(word).width > width) {
        for (const { segment } of segments.segment(word)) {
          if (line && context.measureText(line + segment).width > width) { lines.push(line); line = ""; }
          line += segment;
        }
      } else line += line ? word : word.trimStart();
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function textStickerFont(data: TextSticker) {
  return `${profileFontWeight(data.fontStyle) ?? 450} ${normalizedFontSize(data.fontStyle, data.fontSize)}px ${profileFontInfo(data.fontStyle).family}`;
}

export async function paintTextSticker(canvas: HTMLCanvasElement, input: TextSticker) {
  const data = normalizeTextSticker(input)!;
  const font = textStickerFont(data);
  await document.fonts.load(font, data.content || "Aa");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Text drawing is unavailable.");
  context.font = font;
  const lines = textStickerLines(context, data.content, TEXT_STICKER_WIDTH - TEXT_STICKER_PADDING * 2);
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
  return { height, leading, ascent, paddingTop, paddingBottom, backgroundX, backgroundWidth };
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
