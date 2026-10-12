import type { TextSticker } from "./text-sticker";

/** A temporary, width-relative typing size. Never save this presentation value. */
export function focusedTextSticker(value: TextSticker, initialFontSize: number): TextSticker {
  const initial = Number.isFinite(initialFontSize) && initialFontSize > 0 ? initialFontSize : 32;
  return { ...value, fontSize: Math.min(72, Math.max(14, 32 * value.fontSize / initial)) };
}

export function textStickerFocusWidth(canvasWidth: number, viewportWidth: number) {
  return Math.max(180, Math.min(480, canvasWidth * .82, viewportWidth - 32));
}
