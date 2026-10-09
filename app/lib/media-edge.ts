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
  sourceHeight: number,
  slice: { top: number; height: number },
  width: number,
  height: number,
  overlap: { height: number; sourceHeight: number } = { height: 0, sourceHeight: 0 },
) {
  function drawBand(top: number, sourceBandHeight: number, bandHeight: number, reflected: boolean) {
    const scale = bandHeight / sourceBandHeight;
    context.save();
    try {
      context.setTransform(1, 0, 0, reflected ? -1 : 1, 0, reflected ? height : 0);
      context.beginPath();
      context.rect(0, 0, width, bandHeight);
      context.clip();
      // naturalHeight may be density-corrected by srcset. Drawing the whole
      // image uses its actual bitmap, while these ratios locate the same edge
      // at any source density. The tiny canvas still clips all other pixels.
      context.drawImage(media, 0, -top * scale, width, sourceHeight * scale);
    } finally {
      context.restore();
    }
  }

  // Copy the real edge into the overlap before reflecting below it. This seals
  // fractional CSS-pixel gaps without replacing any original content with a mirror.
  if (overlap.height > 0 && overlap.sourceHeight > 0) {
    drawBand(
      slice.top + slice.height - overlap.sourceHeight,
      overlap.sourceHeight,
      overlap.height,
      false,
    );
  }
  drawBand(slice.top, slice.height, height - overlap.height, true);
}
