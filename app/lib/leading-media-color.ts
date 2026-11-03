import { mediaSourcePoint } from "./page-color-sampler";

type SampleColor = { rgb: number[]; weight: number };
type ColorCluster = { weight: number; pixels: SampleColor[]; sum: number[] };

/** Pick an actual sampled color from the most common group of nearby shades. */
export function commonEdgeColor(pixels: Uint8ClampedArray): string | null {
  const bins = new Map<string, ColorCluster>();
  for (let i = 0; i < pixels.length; i += 4) {
    const weight = pixels[i + 3] / 255;
    if (!weight) continue;
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    // Group compression noise without blending unrelated areas of the image.
    const key = rgb.map(channel => channel >> 4).join(",");
    const bin = bins.get(key) ?? { weight: 0, pixels: [], sum: [0, 0, 0] };
    bin.weight += weight;
    bin.pixels.push({ rgb, weight });
    rgb.forEach((channel, index) => { bin.sum[index] += channel * weight; });
    bins.set(key, bin);
  }
  let winner: ColorCluster | null = null;
  for (const bin of bins.values()) if (!winner || bin.weight > winner.weight) winner = bin;
  if (!winner) return null;
  const mean = winner.sum.map(channel => channel / winner.weight);
  const counts = new Map<string, SampleColor>();
  for (const { rgb, weight } of winner.pixels) {
    const key = rgb.join(",");
    const entry = counts.get(key) ?? { rgb, weight: 0 };
    entry.weight += weight;
    counts.set(key, entry);
  }
  const distance = (rgb: number[]) => rgb.reduce((sum, channel, index) => sum + (channel - mean[index]) ** 2, 0);
  const selected = [...counts.values()].sort((a, b) => b.weight - a.weight || distance(a.rgb) - distance(b.rgb))[0].rgb;
  return `#${selected.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Sample the visible top edge, not the uncropped source or a sticker over it. */
export function sampleLeadingMediaColor(media: HTMLImageElement | HTMLVideoElement, block: HTMLElement) {
  const isVideo = media instanceof HTMLVideoElement;
  const sourceWidth = isVideo ? media.videoWidth : media.naturalWidth;
  const sourceHeight = isVideo ? media.videoHeight : media.naturalHeight;
  if (!sourceWidth || !sourceHeight || (isVideo && media.readyState < 2)) return null;
  const image = media.getBoundingClientRect();
  const crop = block.getBoundingClientRect();
  if (image.width <= 0 || image.height <= 0) return null;
  const style = getComputedStyle(media);
  const y = Math.max(0, crop.top - image.top) + 0.5;
  const left = mediaSourcePoint(Math.max(0, crop.left - image.left) + 0.5, y,
    image.width, image.height, sourceWidth, sourceHeight, style.objectFit, style.objectPosition);
  const right = mediaSourcePoint(Math.min(image.width, crop.right - image.left) - 0.5, y,
    image.width, image.height, sourceWidth, sourceHeight, style.objectFit, style.objectPosition);
  if (!left || !right || right.x <= left.x) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    const scaleX = canvas.width / (right.x - left.x);
    const scaleY = 1 / Math.min(sourceHeight - left.y, Math.max(1, 4 * sourceHeight / image.height));
    // Draw the whole bitmap and let the tiny canvas clip it. Source-rectangle
    // coordinates would misread images whose srcset density changes naturalWidth.
    context.drawImage(media, -left.x * scaleX, -left.y * scaleY,
      sourceWidth * scaleX, sourceHeight * scaleY);
    const pixels = context.getImageData(0, 0, canvas.width, 1).data;
    return commonEdgeColor(pixels);
  } catch {
    // A cross-origin or undecodable source cannot provide a browser color.
    return null;
  }
}
