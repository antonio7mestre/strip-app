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

/** One desktop handle scales radially and rotates around the unchanged center. */
export function stickerHandleTransform(
  origin: { width: number; rotation: number; distance: number; angle: number },
  dx: number,
  dy: number,
) {
  const distance = Math.hypot(dx, dy);
  const angle = distance < 1 ? origin.angle : Math.atan2(dy, dx);
  const rotation = origin.rotation + (angle - origin.angle) * 180 / Math.PI;
  return {
    width: resizeStickerWidth(origin.width * distance / Math.max(1, origin.distance)),
    rotation: ((rotation + 180) % 360 + 360) % 360 - 180,
  };
}
