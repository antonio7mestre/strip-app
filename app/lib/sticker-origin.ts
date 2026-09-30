export type StickerOrigin = "upload" | "pack" | "shape";

export function normalizeStickerOrigin(value: unknown): StickerOrigin | undefined {
  return value === "upload" || value === "pack" || value === "shape" ? value : undefined;
}
