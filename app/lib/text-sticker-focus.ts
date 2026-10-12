import type { TextSticker } from "./text-sticker";

/** Scale the whole sticker to the focus width, never reflow its typography. */
export function focusedTextSticker(value: TextSticker): TextSticker {
  return { ...value };
}

export function textStickerFocusWidth(canvasWidth: number, viewportWidth: number) {
  return Math.max(180, Math.min(480, canvasWidth * .82, viewportWidth - 32));
}
