import type { StickerAsset } from "./sticker-pack";

export const FOOTER_STICKER_MIN_HEIGHT = 40;
export const FOOTER_STICKER_MAX_HEIGHT = 54;
export const FOOTER_STICKER_ROW_HEIGHT = 68;
export const FOOTER_STICKER_COUNT = 20;
export const FOOTER_STICKER_GAP = 24;
export const FOOTER_STICKER_SPEED = 28;

/** Tiny repeatable variation, with a frame that reserves the rotated bounds. */
export function footerStickerLayout(asset: StickerAsset) {
  let hash = 2166136261;
  for (const character of asset.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const height = FOOTER_STICKER_MIN_HEIGHT + ((hash >>> 0) % 9) / 8
    * (FOOTER_STICKER_MAX_HEIGHT - FOOTER_STICKER_MIN_HEIGHT);
  const rotation = ((hash >>> 8) % 13 - 6) * 0.5;
  const width = height * asset.width / asset.height;
  const angle = Math.abs(rotation) * Math.PI / 180;
  const frameWidth = Math.ceil((width * Math.cos(angle) + height * Math.sin(angle)) * 100) / 100;
  return { height, width, rotation, frameWidth };
}

export function footerStickerLoopSeconds(assets: readonly StickerAsset[]) {
  return assets.reduce((width, asset) => width + footerStickerLayout(asset).frameWidth + FOOTER_STICKER_GAP, 0)
    / FOOTER_STICKER_SPEED;
}

/** A varied sample per Strip that stays still during hydration and rerenders. */
export function selectFooterStickers(assets: readonly StickerAsset[], seed: string) {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  const result = assets.filter(asset => asset.category !== "scrap" && asset.category !== "clothing");
  for (let i = result.length - 1; i > 0; i--) {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    const j = Math.floor(((value ^ value >>> 14) >>> 0) / 4294967296 * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0, FOOTER_STICKER_COUNT);
}
