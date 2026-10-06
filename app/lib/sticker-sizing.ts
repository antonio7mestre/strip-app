/** Sticker widths are percentages of the same Strip canvas in every view. */
export const STICKER_MAX_WIDTH = 92;
export const STICKER_MIN_RESIZE_WIDTH = 10;
// Preserve older saved stickers that predate the editor's 10% pinch minimum.
const STICKER_MIN_SAVED_WIDTH = 8;

function boundedWidth(value: unknown, minimum: number) {
  const parsed = Number(value);
  const width = Number.isFinite(parsed) ? parsed : 30;
  return Math.min(STICKER_MAX_WIDTH, Math.max(minimum, width));
}

export function resizeStickerWidth(value: number) {
  return boundedWidth(value, STICKER_MIN_RESIZE_WIDTH);
}

/** Retain authored fractions exactly. Saving must not tighten editor limits. */
export function normalizeStickerWidth(value: unknown) {
  return boundedWidth(value, STICKER_MIN_SAVED_WIDTH);
}
