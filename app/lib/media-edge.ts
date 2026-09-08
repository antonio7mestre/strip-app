type MediaEdgeDimensions = {
  sourceHeight: number;
  renderedHeight: number;
  visibleBottom: number;
  visibleHeight: number;
  extensionHeight: number;
};

// Reflect only the visible edge, including when the original media is cropped.
export function getMediaEdgeSlice(dimensions: MediaEdgeDimensions) {
  if (Object.values(dimensions).some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }
  const { sourceHeight, renderedHeight, visibleBottom, visibleHeight, extensionHeight } = dimensions;
  const scale = sourceHeight / renderedHeight;
  const bottom = Math.min(sourceHeight, visibleBottom * scale);
  const height = Math.min(bottom, visibleHeight * scale, extensionHeight * scale);
  return { top: bottom - height, height };
}

export function paintMediaEdge(
  context: CanvasRenderingContext2D,
  media: CanvasImageSource,
  sourceWidth: number,
  slice: { top: number; height: number },
  width: number,
  height: number,
) {
  // The original bottom pixel meets its reflected copy at the seam.
  context.setTransform(1, 0, 0, -1, 0, height);
  context.drawImage(media, 0, slice.top, sourceWidth, slice.height, 0, 0, width, height);
}
