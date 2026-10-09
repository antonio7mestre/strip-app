// Bound the pixels decoded by readers without changing stored originals.
export const READER_IMAGE_WIDTHS = [480, 768, 1024, 1280, 1600, 1920, 2560] as const;
export const READER_IMAGE_VERSION = "1";

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
