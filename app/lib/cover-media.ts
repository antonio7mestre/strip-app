import { STICKER_PACK } from "./sticker-pack";
import { SHAPE_STICKERS } from "./shape-stickers";
import type { StickerOrigin } from "./sticker-origin";

const packNames = new Set(STICKER_PACK.map(sticker => sticker.name));
const shapeNames = new Set<string>(SHAPE_STICKERS.map(shape => `${shape.name} shape`));

/** Covers use personal photos, not decorative artwork from the sticker tray. */
export function isCoverMedia(block: {
  type: string;
  src?: string;
  alt?: string;
  mediaType?: string;
  stickerOrigin?: StickerOrigin;
}) {
  if (block.type === "image") return true;
  if (block.type !== "sticker" || block.mediaType === "video") return false;
  if (block.stickerOrigin) return block.stickerOrigin === "upload";
  if (block.src?.startsWith("/sticker-pack/")) return false;
  // Older saved stickers lost their bundled URL when uploaded. Their exact
  // catalog labels survive saving, so exclude those until provenance is saved.
  // Explicitly marked uploads above remain eligible even with a matching name.
  return !packNames.has(block.alt ?? "") && !shapeNames.has(block.alt ?? "");
}
