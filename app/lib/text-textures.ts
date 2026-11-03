const textureNames = [
  ["01-blonde-plywood", "Blonde plywood", "#000000"],
  ["03-dark-walnut", "Dark walnut", "#FFFFFF"],
  ["04-amber-burl", "Amber burl", "#FFFFFF"],
  ["08-weathered-concrete", "Weathered concrete", "#000000"],
  ["13-cognac-leather", "Cognac leather", "#FFFFFF"],
  ["14-oxblood-leather", "Oxblood leather", "#FFFFFF"],
  ["16-natural-linen", "Natural linen", "#000000"],
  ["17-indigo-denim", "Indigo denim", "#FFFFFF"],
  ["19-brushed-aluminum", "Brushed aluminum", "#000000"],
  ["21-deep-teal-velvet", "Deep teal velvet", "#FFFFFF"],
  ["22-olive-painted-canvas", "Olive painted canvas", "#FFFFFF"],
  ["24-ruby-woven-fabric", "Ruby woven fabric", "#FFFFFF"],
  ["25-pink-tweed", "Pink tweed", "#000000"],
  ["26-mauve-chenille", "Mauve chenille", "#FFFFFF"],
  ["28-fuchsia-glitter", "Fuchsia glitter", "#FFFFFF"],
  ["29-plum-shimmer", "Plum shimmer", "#FFFFFF"],
  ["30-scarlet-metallic-fabric", "Scarlet metallic fabric", "#FFFFFF"],
  ["31-blue-square-tile", "Blue square tile", "#000000"],
  ["32-antiqued-mirror-mosaic", "Antiqued mirror mosaic", "#FFFFFF"],
  ["33-amber-glass-blocks", "Amber glass blocks", "#000000"],
  ["34-pebbled-sand", "Pebbled sand", "#000000"],
  ["36-pool-ripples", "Pool ripples", "#000000"],
  ["37-golden-wheat", "Golden wheat", "#000000"],
  ["38-green-wheat", "Green wheat", "#FFFFFF"],
  ["39-weathered-brick", "Weathered brick", "#FFFFFF"],
] as const;

// Ink sampled from the center of each square thumbnail, where the check sits.
export const TEXT_TEXTURES = textureNames.map(([id, label, checkColor]) => ({
  id, label, checkColor, src: `/textures/v1/${id}.webp`, thumbnail: `/textures/v1/${id}-thumb.webp`,
}));
export type TextTexture = typeof TEXT_TEXTURES[number];
const texturesById = new Map<string, TextTexture>(TEXT_TEXTURES.map(texture => [texture.id, texture]));

/** Persist an allowlisted ID, never a caller-provided asset URL. */
export function textTexture(value: unknown) {
  return typeof value === "string" ? texturesById.get(value) : undefined;
}
export function normalizeTextTexture(value: unknown) {
  return textTexture(value)?.id;
}

/** Same top-centered crop as CSS object-fit: cover. Width fills first, then tall
 * blocks zoom in just enough to fill their height without stretching. */
export function textureCoverRect(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale, cropHeight = height / scale;
  return { x: (sourceWidth - cropWidth) / 2, y: 0,
    width: cropWidth, height: cropHeight };
}

/** One cover transform spans the text and its attached editing controls. */
export function textureControlsGeometry(sourceWidth: number, sourceHeight: number,
  blockWidth: number, blockHeight: number, controlsWidth: number, controlsHeight: number, controlsTop = -1) {
  const extension = Math.max(0, controlsTop + controlsHeight);
  const scale = Math.max(blockWidth / sourceWidth, (blockHeight + extension) / sourceHeight);
  return {
    extension,
    backgroundSize: `${sourceWidth * scale}px ${sourceHeight * scale}px`,
    backgroundPosition: `${(controlsWidth - sourceWidth * scale) / 2}px ${-(blockHeight + controlsTop)}px`,
    source: { x: (sourceWidth - controlsWidth / scale) / 2, y: (blockHeight + controlsTop) / scale,
      width: controlsWidth / scale, height: controlsHeight / scale },
  };
}

export function textBackgroundChange<T extends { backgroundColor?: string; backgroundTexture?: string }>(change: T) {
  return Object.hasOwn(change, "backgroundColor") && !Object.hasOwn(change, "backgroundTexture")
    ? { ...change, backgroundTexture: undefined } : change;
}
