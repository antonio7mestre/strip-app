/** Small layout hints travel with the block, so showing its space never
 * requires downloading the original media. Older blocks still use height. */
export function mediaLayoutMetadata(block: { type: string; mediaWidth?: unknown; mediaHeight?: unknown; previewSrc?: unknown }) {
  if (block.type !== "image" && block.type !== "video") return {};
  const width = Number(block.mediaWidth), height = Number(block.mediaHeight);
  const dimensions = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width <= 65_536 && height <= 65_536
    ? { mediaWidth: width, mediaHeight: height } : {};
  const preview = typeof block.previewSrc === "string" && block.previewSrc.length <= 16_384
    && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(block.previewSrc)
    ? { previewSrc: block.previewSrc } : {};
  return { ...dimensions, ...preview };
}
