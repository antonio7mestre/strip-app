import { posterMedia, posterPalette, type PosterAssets, type PosterPhoto, type PosterStrip } from "./share-posters";

function readPhoto(src: string, signal: AbortSignal): Promise<PosterPhoto | null> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(null); return; }
    const image = new Image(); image.crossOrigin = "anonymous"; image.decoding = "async";
    const finish = (photo: PosterPhoto | null) => {
      clearTimeout(timeout); signal.removeEventListener("abort", cancel); image.onload = null; image.onerror = null;
      if (!photo) image.src = "";
      resolve(photo);
    };
    const cancel = () => finish(null);
    const timeout = setTimeout(cancel, 10000);
    signal.addEventListener("abort", cancel, { once: true });
    image.onerror = cancel;
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) { finish(null); return; }
      // Decode once and bound memory, instead of keeping ten full-resolution copies.
      const canvas = document.createElement("canvas"), scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const c = canvas.getContext("2d");
      if (!c) { finish(null); return; }
      c.drawImage(image, 0, 0, canvas.width, canvas.height);
      finish({ source: canvas, width: canvas.width, height: canvas.height });
    };
    image.src = src;
  });
}

export async function preparePosterAssets(strip: PosterStrip, signal: AbortSignal): Promise<PosterAssets> {
  const sources = posterMedia(strip), photos: (PosterPhoto | null)[] = new Array(sources.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, sources.length) }, async () => {
    while (next < sources.length && !signal.aborted) { const i = next++; photos[i] = await readPhoto(sources[i], signal); }
  }));
  if (signal.aborted) { photos.forEach(p => { if (p?.source instanceof HTMLCanvasElement) { p.source.width = 0; p.source.height = 0; } }); throw new DOMException("Cancelled", "AbortError"); }
  const unique: PosterPhoto[] = [], fingerprints: Uint8ClampedArray[] = [];
  const sample = document.createElement("canvas"); sample.width = 16; sample.height = 16;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  for (const photo of photos) {
    if (!photo) continue;
    if (sampleContext) {
      sampleContext.drawImage(photo.source, 0, 0, 16, 16);
      const pixels = sampleContext.getImageData(0, 0, 16, 16).data;
      const duplicate = fingerprints.some((previous, i) => {
        if (Math.abs(unique[i].width / unique[i].height - photo.width / photo.height) > .03) return false;
        let difference = 0; for (let n = 0; n < pixels.length; n += 4) for (let channel = 0; channel < 3; channel++) difference += Math.abs(previous[n + channel] - pixels[n + channel]);
        return difference / (16 * 16 * 3) < 4;
      });
      if (duplicate) { if (photo.source instanceof HTMLCanvasElement) { photo.source.width = 0; photo.source.height = 0; } continue; }
      fingerprints.push(pixels);
    }
    unique.push(photo);
  }
  sample.width = 0; sample.height = 0;
  return {
    title: (strip.title || "").trim(),
    address: strip.username ? `${strip.username}.striiip.com` : "striiip.com",
    photos: unique, palette: posterPalette(strip),
  };
}

export function disposePosterAssets(assets: PosterAssets) {
  for (const photo of assets.photos) if (photo.source instanceof HTMLCanvasElement) { photo.source.width = 0; photo.source.height = 0; }
}
