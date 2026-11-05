import { mediaPreview, type MediaColor } from "./media-palette";
export type MediaImportProgress = { completed: number; total: number };
export type MediaSize = { width: number; height: number };
export type PreparedMedia = MediaSize & {
  type: "image" | "video";
  src: string;
  alt: string;
  previewSrc?: string;
  palette?: MediaColor;
};

/** Keep the selected insertion spot while preparing the complete media batch. */
export function mediaImportInsertionIndex(blocks: readonly { id: string }[], afterId: string | null | undefined) {
  const index = blocks.findIndex(block => block.id === afterId);
  return index >= 0 ? index + 1 : blocks.length;
}

const IMPORT_CONCURRENCY = 2;
const DECODE_TIMEOUT_MS = 20_000;
const MAX_MEDIA_BYTES = 80 * 1024 * 1024;

function aborted() { return new DOMException("Import cancelled", "AbortError"); }

/** Videos retain the camera-roll Blob instead of duplicating it as a huge
 * base64 string. The saver streams this URL's original file individually. */
function readMedia(file: File, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.reject(aborted());
  if (file.type.startsWith("video/")) return Promise.resolve(URL.createObjectURL(file));
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(aborted()); return; }
    const reader = new FileReader();
    const cleanup = () => {
      signal.removeEventListener("abort", cancel);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    const cancel = () => { cleanup(); reader.abort(); reject(aborted()); };
    reader.onload = () => {
      const source = reader.result;
      cleanup();
      if (typeof source === "string") resolve(source);
      else reject(new Error("Could not read media"));
    };
    reader.onerror = () => { cleanup(); reject(new Error("Could not read media")); };
    reader.onabort = () => { cleanup(); reject(aborted()); };
    signal.addEventListener("abort", cancel, { once: true });
    try { reader.readAsDataURL(file); }
    catch (error) { cleanup(); reject(error); }
  });
}

function measureMedia(src: string, type: PreparedMedia["type"], signal: AbortSignal, previews: boolean): Promise<MediaSize & Pick<PreparedMedia, "previewSrc" | "palette">> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(aborted()); return; }
    const image = type === "image" ? new Image() : null;
    const video = type === "video" ? document.createElement("video") : null;
    let settled = false;
    let frameTimeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(frameTimeout);
      signal.removeEventListener("abort", cancel);
      if (image) { image.onload = image.onerror = null; }
      if (video) {
        video.onloadedmetadata = video.onloadeddata = video.onseeked = video.onerror = null;
        video.removeAttribute("src");
        video.load();
      }
    };
    const finish = (size?: MediaSize & Pick<PreparedMedia, "previewSrc" | "palette">, error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (size && size.width > 0 && size.height > 0) resolve(size);
      else reject(error ?? new Error("Could not decode media"));
    };
    const cancel = () => { finish(undefined, aborted()); if (image) image.src = ""; };
    const timeout = setTimeout(() => finish(), DECODE_TIMEOUT_MS);
    signal.addEventListener("abort", cancel, { once: true });
    if (image) {
      image.onload = () => {
        void image.decode().catch(() => {}).then(() => finish({ width: image.naturalWidth, height: image.naturalHeight, ...(previews ? mediaPreview(image, image.naturalWidth, image.naturalHeight) : {}) }));
      };
      image.onerror = () => finish();
      image.src = src;
    } else if (video) {
      video.preload = previews ? "auto" : "metadata";
      video.playsInline = true;
      video.muted = true;
      const dimensions = () => ({ width: video.videoWidth, height: video.videoHeight });
      const frame = () => {
        if (video.readyState >= 2) finish({ ...dimensions(), ...mediaPreview(video, video.videoWidth, video.videoHeight) });
      };
      video.onloadedmetadata = () => {
        if (!previews) { finish(dimensions()); return; }
        frameTimeout = setTimeout(() => finish(dimensions()), 1200);
        try { video.currentTime = Math.min(.08, Number.isFinite(video.duration) ? video.duration / 2 : .08); } catch { /* First decoded frame is sufficient. */ }
        frame();
      };
      if (previews) { video.onloadeddata = frame; video.onseeked = frame; }
      video.onerror = () => finish();
      video.src = src;
      video.load();
    }
  });
}

/** Decode first, then hand the editor one ordered batch with stable dimensions. */
export async function prepareMediaFiles(files: readonly File[], {
  signal,
  onProgress, onPrepared, previews = false,
}: { signal: AbortSignal; onProgress?: (progress: MediaImportProgress) => void;
  onPrepared?: (media: PreparedMedia, index: number) => void; previews?: boolean }) {
  const prepared: Array<PreparedMedia | null> = Array(files.length).fill(null);
  const settled = Array<boolean>(files.length).fill(false);
  let cursor = 0, completed = 0, delivered = 0;
  onProgress?.({ completed, total: files.length });
  const worker = async () => {
    while (cursor < files.length) {
      if (signal.aborted) throw aborted();
      const index = cursor++, file = files[index];
      let src: string | undefined;
      try {
        const type = file.type.startsWith("video/") ? "video" : "image";
        if ((!file.type.startsWith("image/") && type !== "video") || /svg|xml/i.test(file.type)
          || file.size === 0 || file.size > MAX_MEDIA_BYTES) throw new Error("Unsupported media");
        src = await readMedia(file, signal);
        const size = await measureMedia(src, type, signal, previews);
        prepared[index] = { type, src, alt: file.name.replace(/\.[^/.]+$/, ""), ...size };
      } catch (error) {
        if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw aborted();
        // A damaged file must not prevent the remaining selections from arriving.
      }
      if (signal.aborted) throw aborted();
      settled[index] = true;
      // Deliver the ready prefix, preserving selection order even when worker 2 finishes first.
      while (delivered < files.length && settled[delivered]) {
        const item = prepared[delivered];
        if (item) onPrepared?.(item, delivered);
        delivered++;
      }
      onProgress?.({ completed: ++completed, total: files.length });
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, files.length) }, worker));
  } catch (error) {
    prepared.forEach(item => { if (item?.src.startsWith("blob:")) URL.revokeObjectURL(item.src); });
    throw error;
  }
  if (signal.aborted) throw aborted();
  const media = prepared.filter((item): item is PreparedMedia => item !== null);
  return { media, failed: files.length - media.length };
}
