export type StickerOrigin = "upload" | "pack" | "shape" | "text";

export function normalizeStickerOrigin(value: unknown): StickerOrigin | undefined {
  return value === "upload" || value === "pack" || value === "shape" || value === "text" ? value : undefined;
}
