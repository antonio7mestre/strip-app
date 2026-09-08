export type EntrancePalette = [string, string, string];

/** Real completed media checks, including decoded cover and video first frames.
 * Failed media settles too, so a broken asset cannot strand the loader. */
export function entranceLoadPercent(settled: number, total: number) {
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(settled)) return 0;
  if (total === 0) return 100;
  if (settled >= total) return 100;
  return Math.min(99, Math.floor(Math.max(0, settled) / total * 100));
}

/** Show every integer, but never invent progress beyond settled media. */
export function startEntranceCounter(onChange: (value: number) => void) {
  let value = 0, target = 0, frame = 0, disposed = false;
  let lastStep: number | null = null;
  const schedule = () => {
    if (!disposed && !frame && value < target) frame = requestAnimationFrame(tick);
  };
  function tick(now: number) {
    frame = 0;
    if (disposed) return;
    if (value < target && (lastStep === null || now - lastStep >= 24)) {
      // Never catch up by skipping numbers after a slow frame or hidden tab.
      value++;
      lastStep = now;
      onChange(value);
    }
    schedule();
  }
  return {
    setTarget(next: number) {
      if (!Number.isFinite(next)) return;
      target = Math.max(value, Math.min(100, Math.floor(next)));
      schedule();
    },
    dispose() { disposed = true; cancelAnimationFrame(frame); frame = 0; },
  };
}

export function normalizeEntranceColor(value: string) {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) return "#" + [...hex].map(char => char + char).join("").toUpperCase();
  return /^[0-9a-f]{6}$/i.test(hex) ? "#" + hex.toUpperCase() : null;
}

function channels(color: string) {
  return [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
}

function hex(rgb: number[]) {
  return "#" + rgb.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function chroma(color: string) {
  const rgb = channels(color);
  return Math.max(...rgb) - Math.min(...rgb);
}

function distance(a: string, b: string) {
  const first = channels(a), second = channels(b);
  return Math.hypot(...first.map((value, index) => value - second[index]));
}

/** Small, deterministic color sample. Never inspect full-resolution pixel data. */
export function paletteFromPixels(pixels: ArrayLike<number>): string[] {
  const buckets = new Map<number, { count: number; rgb: number[] }>();
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < 160) continue;
    const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const high = Math.max(...rgb), low = Math.min(...rgb);
    if (high < 24 || low > 242) continue;
    const key = (rgb[0] >> 4) * 256 + (rgb[1] >> 4) * 16 + (rgb[2] >> 4);
    const bucket = buckets.get(key) ?? { count: 0, rgb: [0, 0, 0] };
    bucket.count++;
    bucket.rgb = bucket.rgb.map((value, channel) => value + rgb[channel]);
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()].map(bucket => {
    const color = hex(bucket.rgb.map(value => value / bucket.count));
    return { color, score: bucket.count * (0.45 + chroma(color) / 255) };
  }).sort((a, b) => b.score - a.score);
  const selected: string[] = [];
  for (const { color } of ranked) {
    if (selected.every(previous => distance(previous, color) > 56)) selected.push(color);
    if (selected.length === 5) break;
  }
  return selected;
}

/** Honor authored colors, then fill with colors actually present in the media. */
export function makeEntrancePalette(authored: string[], sampled: string[]): EntrancePalette {
  const authoredColors = authored.map(normalizeEntranceColor).filter((color): color is string => color !== null);
  const sampledColors = sampled.map(normalizeEntranceColor).filter((color): color is string => color !== null);
  const candidates = [
    ...authoredColors.filter(color => chroma(color) > 24),
    ...sampledColors,
    ...authoredColors.filter(color => chroma(color) <= 24),
  ];
  const colors: string[] = [];
  for (const color of candidates) {
    if (colors.every(previous => distance(previous, color) > 56)) colors.push(color);
    if (colors.length === 3) break;
  }
  const base = colors[0] ?? "#3155FF";
  if (!colors.length) colors.push(base);
  if (colors.length === 1) colors.push(hex(channels(base).map(value => value + (255 - value) * 0.32)));
  if (colors.length === 2) colors.push(hex(channels(base).map(value => value * 0.64 + 26)));
  return colors as EntrancePalette;
}

export function sampleEntranceMedia(media: HTMLImageElement | HTMLVideoElement) {
  const width = "naturalWidth" in media ? media.naturalWidth : media.videoWidth;
  const height = "naturalHeight" in media ? media.naturalHeight : media.videoHeight;
  if (!width || !height) return [];
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(media, 0, 0, 32, 32);
    return paletteFromPixels(context.getImageData(0, 0, 32, 32).data);
  } catch {
    // A failed or cross-origin sample must never hold up the reader.
    return [];
  }
}
