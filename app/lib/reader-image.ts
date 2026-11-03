// Bound the pixels decoded by readers without changing stored originals.
export const READER_IMAGE_WIDTHS = [480, 768, 1024, 1280, 1600, 1920, 2560] as const;
export const READER_IMAGE_VERSION = "1";
export const READER_PREVIEW_VERSION = "preview-1";
export const READER_PREVIEW_WIDTH = 240;
// A separate recipe and cache identity for small library cards only.
export const LIBRARY_COVER_VERSION = "library-1";
export const LIBRARY_COVER_WIDTH = 480;

const LOCAL_ORIGIN = "http://localhost";
const READER_IMAGE_PATH = /^\/api\/(?:strips\/[a-zA-Z0-9_-]{8,128}\/(?:media\/[a-zA-Z0-9_-]{8,128}|cover)|drafts\/[a-zA-Z0-9_-]{8,128}\/media\/[a-zA-Z0-9_-]{8,128})$/;

export function getReaderImageProps(src: string, sizes = "100vw"): {
  src: string; srcSet?: string; sizes?: string;
} {
  const relative = src.startsWith("/") && !src.startsWith("//");
  if (!relative && !/^https?:\/\//i.test(src)) return { src };
  let url: URL;
  try { url = new URL(src, LOCAL_ORIGIN); } catch { return { src }; }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const production = url.hostname === "striiip.com" || url.hostname.endsWith(".striiip.com");
  if ((relative && url.origin !== LOCAL_ORIGIN)
    || (!relative && !((local && /^https?:$/.test(url.protocol)) || (production && url.protocol === "https:")))
    || url.username || url.password || !READER_IMAGE_PATH.test(url.pathname)) return { src };

  const variant = (width: number) => {
    const candidate = new URL(url);
    candidate.searchParams.set("reader-width", String(width));
    candidate.searchParams.set("reader-version", READER_IMAGE_VERSION);
    return relative ? `${candidate.pathname}${candidate.search}${candidate.hash}` : candidate.href;
  };
  return {
    src: variant(1280),
    srcSet: READER_IMAGE_WIDTHS.map((width) => `${variant(width)} ${width}w`).join(", "),
    sizes,
  };
}

/** Never replace the saved cover URL: posters, social previews and readers use it. */
export function getLibraryCoverSrc(src: string): string {
  const reader = getReaderImageProps(src);
  if (!reader.srcSet) return src;
  const relative = src.startsWith("/");
  const url = new URL(reader.src, LOCAL_ORIGIN);
  url.searchParams.set("reader-width", String(LIBRARY_COVER_WIDTH));
  url.searchParams.set("reader-version", LIBRARY_COVER_VERSION);
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

/** Transient reader preview only. Never save this URL to a draft or poster. */
export function getReaderPreviewSrc(src: string): string {
  const reader = getReaderImageProps(src);
  if (!reader.srcSet) return src;
  const relative = src.startsWith("/");
  const url = new URL(reader.src, LOCAL_ORIGIN);
  url.searchParams.set("reader-width", String(READER_PREVIEW_WIDTH));
  url.searchParams.set("reader-version", READER_PREVIEW_VERSION);
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

export function getReaderUpgradeSrc(src: string, cssWidth: number, density: number): string {
  const reader = getReaderImageProps(src);
  if (!reader.srcSet) return src;
  const pixels = Math.max(1, cssWidth) * Math.max(1, density || 1);
  const width = READER_IMAGE_WIDTHS.find(width => width >= pixels) ?? READER_IMAGE_WIDTHS.at(-1)!;
  const relative = src.startsWith("/");
  const url = new URL(reader.src, LOCAL_ORIGIN);
  url.searchParams.set("reader-width", String(width));
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.href;
}
