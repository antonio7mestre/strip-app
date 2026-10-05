/** Keep saved transforms compatible with the editor's signed degree range. */
export function normalizeStickerRotation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return 0;
  if (value >= -180 && value < 180) return value;
  return ((value % 360 + 540) % 360) - 180;
}
