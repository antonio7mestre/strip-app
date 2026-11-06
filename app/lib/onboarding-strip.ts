import { STICKER_COLORS } from "./sticker-colors";
import type { MediaColor } from "./media-palette";
import { initialPackStickerWidth, type StickerAsset } from "./sticker-pack";
import type { PreparedMedia } from "./media-import";

export type OnboardingMedia = PreparedMedia & { id: string };
export type FirstStripInput = { id: string; createdAt: number; media: OnboardingMedia[]; stickers: StickerAsset[]; message: string; seed: number; width: number; textHeight: number };
export const FIRST_STRIP_BLOCK_LIMIT = 100;
export const FIRST_STRIP_FONT_SIZE = 24;

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function shuffledStickers(assets: readonly StickerAsset[], seed: number) {
  const random = seededRandom(seed);
  const result = [...assets];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Numeric palette distance only. Sampling happened during media preparation. */
export function colorMatchedStickers(assets: readonly StickerAsset[], seed: number, colors: readonly MediaColor[]) {
  const shuffled = shuffledStickers(assets, seed);
  if (!colors.length) return shuffled;
  const palette = colors.slice(0, 8);
  const ranked = shuffled.map((asset, index) => {
    const color = STICKER_COLORS[asset.id];
    const distance = color ? Math.min(...palette.map(target =>
      (color[0] - target[0]) ** 2 + (color[1] - target[1]) ** 2 + (color[2] - target[2]) ** 2)) : Infinity;
    return { asset, distance, index };
  }).sort((a, b) => a.distance - b.distance || a.index - b.index);
  // Mix in surprises so matching a warm portrait does not produce only brown stickers.
  const matched = ranked.slice(0, 24).map(item => item.asset);
  const picked = new Set(matched.map(asset => asset.id));
  const rest = shuffled.filter(asset => !picked.has(asset.id));
  const result: StickerAsset[] = [];
  while (matched.length) { result.push(...matched.splice(0, 2)); if (rest.length) result.push(rest.shift()!); }
  return [...result, ...rest];
}

/** Shortest-column placement preserves the order and positions when more are appended. */
export function stickerMasonry(assets: readonly StickerAsset[], width: number) {
  const columns = width >= 480 ? 4 : 3;
  const gap = 8;
  const cell = Math.max(1, (width - gap * (columns - 1)) / columns);
  const heights = Array<number>(columns).fill(6);
  const items = assets.map((asset, index) => {
    const column = heights.indexOf(Math.min(...heights));
    const rotation = (index * 7 % 17) - 8;
    const selectedRotation = rotation + (rotation < 0 ? -4 : 4);
    const from = Math.abs(rotation) * Math.PI / 180;
    const to = Math.abs(selectedRotation) * Math.PI / 180;
    // Reserve the whole selection rotation, including its widest intermediate
    // angle, so a long sticker never touches its neighbor while turning.
    const extent = (a: number, b: number) => {
      const peak = Math.max(from, Math.min(to, Math.atan2(b, a)));
      return a * Math.cos(peak) + b * Math.sin(peak);
    };
    // Explicit image dimensions also avoid percentage-height grid overflow in Safari.
    const inset = 5;
    const availableWidth = Math.max(1, cell - inset * 2);
    const availableHeight = Math.max(1, cell * 1.65 - inset * 2);
    const rotatedWidth = extent(asset.width, asset.height);
    const rotatedHeight = extent(asset.height, asset.width);
    const scale = Math.min(availableWidth / rotatedWidth, availableHeight / rotatedHeight);
    const imageWidth = asset.width * scale;
    const imageHeight = asset.height * scale;
    const height = Math.max(44, rotatedHeight * scale + inset * 2);
    const item = { asset, index, left: column * (cell + gap), top: heights[column], width: cell, height, imageWidth, imageHeight, rotation, selectedRotation };
    heights[column] += height + gap;
    return item;
  });
  return { items, height: Math.max(...heights) };
}

export function buildFirstStrip(input: FirstStripInput, backgroundColor: string, textColor: string) {
  if (!input.media.length) throw new Error("Choose at least one photo or video.");
  const message = input.message.trim();
  if (input.media.length + input.stickers.length + (message ? 1 : 0) > FIRST_STRIP_BLOCK_LIMIT) throw new Error("This Strip is full. Remove an item to continue.");
  const random = seededRandom(input.seed);
  const text = { id: `${input.id}-words`, type: "text" as const, content: message, backgroundColor, textColor,
    fontStyle: "sans" as const, fontSize: FIRST_STRIP_FONT_SIZE, textAlign: "left" as const, height: input.textHeight };
  const flow = [
    ...(message ? [text] : []),
    ...input.media.map(media => ({ id: media.id, type: media.type, src: media.src, alt: media.alt,
      height: input.width * media.height / media.width, mediaWidth: media.width, mediaHeight: media.height, previewSrc: media.previewSrc, ...(media.type === "video" ? { audioEnabled: true } : {}) })),
  ];
  let y = 0;
  const seams: number[] = [];
  flow.forEach((block, index) => {
    y += block.height;
    if (index < flow.length - 1 && block.type !== "text" && flow[index + 1].type !== "text") seams.push(y);
  });
  // A one-photo Strip still gets stickers on media, below the opening text.
  if (!seams.length) seams.push((message ? text.height : 0) + input.width * input.media[0].height / input.media[0].width * 0.75);
  const shuffledSeams = [...seams];
  for (let i = shuffledSeams.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffledSeams[i], shuffledSeams[j]] = [shuffledSeams[j], shuffledSeams[i]];
  }
  const stickers = input.stickers.map((asset, index) => {
    const seamIndex = index % shuffledSeams.length;
    const onSeam = Math.ceil((input.stickers.length - seamIndex) / shuffledSeams.length);
    const lane = Math.floor(index / shuffledSeams.length) % 3;
    const center = onSeam === 1 ? 30 + random() * 40 : onSeam === 2 ? 25 + lane * 50 : 20 + lane * 30;
    return {
    id: `${input.id}-sticker-${asset.id}`, type: "sticker" as const, src: asset.src, alt: asset.name,
    stickerOrigin: "pack" as const, x: Math.max(20, Math.min(80, center + random() * 8 - 4)),
    y: shuffledSeams[seamIndex],
    width: initialPackStickerWidth(22 + random() * 8, asset), rotation: -18 + random() * 36,
  }; });
  return [...flow, ...stickers];
}
