type Pixel = readonly [number, number, number, number];
type Media = HTMLImageElement | HTMLVideoElement;

const TOOLS = ".selector-dock, .profile-editor-dock, .page-color-picker-indicator, .profile-editor-hint, .block-controls, .sticker-delete-control";

/** Map the untransformed content box into the pixels actually painted by object-fit. */
export function mediaSourcePoint(x: number, y: number, width: number, height: number,
  sourceWidth: number, sourceHeight: number, fit: string, position = "50% 50%") {
  if (Math.min(width, height, sourceWidth, sourceHeight) <= 0) return null;
  let paintedWidth = width, paintedHeight = height;
  if (fit !== "fill") {
    let scale = fit === "cover" ? Math.max(width / sourceWidth, height / sourceHeight) :
      Math.min(width / sourceWidth, height / sourceHeight);
    if (fit === "none") scale = 1;
    if (fit === "scale-down") scale = Math.min(1, scale);
    paintedWidth = sourceWidth * scale; paintedHeight = sourceHeight * scale;
  }
  const parts = position.split(/\s+/);
  const offset = (part: string, space: number) => {
    const keywords: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
    if (part in keywords) return space * keywords[part];
    return part.endsWith("%") ? space * parseFloat(part) / 100 : parseFloat(part) || 0;
  };
  const left = offset(parts[0], width - paintedWidth);
  const top = offset(parts[1] ?? "50%", height - paintedHeight);
  if (x < left || y < top || x >= left + paintedWidth || y >= top + paintedHeight) return null;
  return { x: (x - left) / paintedWidth * sourceWidth, y: (y - top) / paintedHeight * sourceHeight };
}

/** Front-to-back compositing lets transparent cutouts and tape reveal what is below. */
export function compositePagePixels(pixels: readonly Pixel[]) {
  let red = 0, green = 0, blue = 0, remaining = 1;
  for (const [r, g, b, alpha] of pixels) {
    const coverage = Math.min(1, Math.max(0, alpha)) * remaining;
    red += r * coverage; green += g * coverage; blue += b * coverage;
    remaining -= coverage;
  }
  if (remaining === 1) return null;
  return `#${[red, green, blue].map(channel => Math.round(channel + 255 * remaining)
    .toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function backgroundPixel(color: string, opacity: number): Pixel | null {
  const match = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].replace("/", " ").split(/[\s,]+/).filter(Boolean);
  const channels = parts.map((part, index) => parseFloat(part) * (part.endsWith("%") ? (index === 3 ? 0.01 : 2.55) : 1));
  if (channels.length < 3 || channels.some(Number.isNaN)) return null;
  return [channels[0], channels[1], channels[2], (channels[3] ?? 1) * opacity];
}

function effectiveOpacity(element: Element) {
  let opacity = 1;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.visibility === "hidden") return 0;
    opacity *= Number(style.opacity);
  }
  return opacity;
}

function mediaPixel(media: Media, clientX: number, clientY: number,
  frames?: WeakMap<HTMLVideoElement, HTMLCanvasElement>): Pixel | null {
  const frozen = media instanceof HTMLVideoElement ? frames?.get(media) : undefined;
  const source = frozen ?? media;
  const sourceWidth = frozen?.width ?? (media instanceof HTMLImageElement ? media.naturalWidth : media.videoWidth);
  const sourceHeight = frozen?.height ?? (media instanceof HTMLImageElement ? media.naturalHeight : media.videoHeight);
  if (!sourceWidth || !sourceHeight) return null;
  const bounds = media.getBoundingClientRect(), style = getComputedStyle(media);
  const width = parseFloat(style.width), height = parseFloat(style.height);
  if (!width || !height) return null;
  // Sticker rotation lives on its parent. Undo the entire 2D transform chain,
  // rather than treating the rotated bounding rectangle as the image itself.
  let transform = new DOMMatrix();
  for (let node: Element | null = media; node; node = node.parentElement) {
    const value = getComputedStyle(node).transform;
    if (value !== "none") transform = new DOMMatrix(value).multiply(transform);
  }
  const determinant = transform.a * transform.d - transform.b * transform.c;
  if (Math.abs(determinant) < 0.000001) return null;
  const dx = clientX - bounds.left - bounds.width / 2, dy = clientY - bounds.top - bounds.height / 2;
  const x = (transform.d * dx - transform.c * dy) / determinant + width / 2;
  const y = (-transform.b * dx + transform.a * dy) / determinant + height / 2;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const point = mediaSourcePoint(x, y, width, height, sourceWidth, sourceHeight, style.objectFit, style.objectPosition);
  if (!point) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(source, Math.floor(point.x), Math.floor(point.y), 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255 * effectiveOpacity(media)];
  } catch {
    // Unready or cross-origin media must not leave the previous sample behind.
    return null;
  }
}

export function samplePageColorAtPoint(clientX: number, clientY: number,
  frames?: WeakMap<HTMLVideoElement, HTMLCanvasElement>) {
  // Artwork deliberately ignores pointer events for editing. Temporarily include
  // it in hit testing so the browser provides the real paint order, including
  // overlapping, rotated stickers. Restore immediately, before the next paint.
  const restored: Array<{ media: Media; value: string; priority: string }> = [];
  let elements: Element[];
  try {
    document.querySelectorAll<Media>(".sticker-block img, .sticker-block video, .image-block img, .video-block video").forEach(media => {
      const box = media.getBoundingClientRect();
      if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return;
      restored.push({ media, value: media.style.getPropertyValue("pointer-events"), priority: media.style.getPropertyPriority("pointer-events") });
      media.style.setProperty("pointer-events", "auto", "important");
    });
    elements = document.elementsFromPoint(clientX, clientY);
  } finally {
    for (const { media, value, priority } of restored) {
      if (value) media.style.setProperty("pointer-events", value, priority);
      else media.style.removeProperty("pointer-events");
    }
  }
  const pixels: Pixel[] = [];
  let remaining = 1;
  const add = (pixel: Pixel | null) => {
    if (!pixel || pixel[3] <= 0) return;
    pixels.push(pixel); remaining *= 1 - pixel[3];
  };
  for (const element of elements) {
    if (element.closest(TOOLS)) continue;
    if (element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
      add(mediaPixel(element, clientX, clientY, frames));
    }
    if (remaining <= 1 / 255) break;
    add(backgroundPixel(getComputedStyle(element).backgroundColor, effectiveOpacity(element)));
    if (remaining <= 1 / 255) break;
  }
  return compositePagePixels(pixels);
}
