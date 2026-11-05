/** Tiny, already-decoded samples only. No second request or image recognition. */
export type MediaColor = readonly [number, number, number];
export function sampleMediaColor(pixels: ArrayLike<number>): MediaColor {
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 96) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin);
  }
  const winner = [...bins.values()].reduce((best, bin) => bin.count > best.count ? bin : best, { count: 0, r: 0, g: 0, b: 0 });
  return winner.count ? [Math.round(winner.r / winner.count), Math.round(winner.g / winner.count), Math.round(winner.b / winner.count)] : [128, 128, 128];
}
export function mediaPreview(source: CanvasImageSource, width: number, height: number) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = Math.max(1, Math.round(32 * height / width));
    // A fixed bound avoids work proportional to a panorama's original size.
    if (canvas.height > 48) { canvas.width = Math.max(1, Math.round(48 * width / height)); canvas.height = 48; }
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return {};
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return { previewSrc: canvas.toDataURL('image/jpeg', .55), palette: sampleMediaColor(context.getImageData(0, 0, canvas.width, canvas.height).data) };
  } catch { return {}; }
}
