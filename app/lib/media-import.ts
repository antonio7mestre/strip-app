export type MediaImportProgress = { completed: number; total: number };
export const MEDIA_IMPORT_BACKGROUND = "#d9d9d9";
export type MediaSize = { width: number; height: number };
export type PreparedMedia = MediaSize & {
  type: "image" | "video";
  src: string;
  alt: string;
};

/** The pending block and decoded batch use the same captured insertion spot. */
export function mediaImportInsertionIndex(blocks: readonly { id: string }[], afterId: string | null | undefined) {
  const index = blocks.findIndex(block => block.id === afterId);
  return index >= 0 ? index + 1 : blocks.length;
}

/** A pending first block owns the same safe-area treatment as a text block. */
export function mediaImportIsLeading(blocks: readonly { id: string; type: string }[], afterId: string | null | undefined, mountedFirstId?: string) {
  const first = blocks.findIndex(block => block.type !== "sticker");
  if (mountedFirstId) return first >= 0 && blocks[first].id === mountedFirstId;
  return first < 0 || mediaImportInsertionIndex(blocks, afterId) <= first;
}

/** Render-only placeholder. Never add it to draft state or serialized content. */
export function withMediaImportBlock<Node>(blocks: readonly { id: string }[], nodes: readonly Node[], pending: Node | null, afterId: string | null | undefined, mountedFirstId?: string) {
  if (pending === null) return nodes;
  const rendered = [...nodes];
  const mountedIndex = mountedFirstId ? blocks.findIndex(block => block.id === mountedFirstId) : -1;
  rendered.splice(mountedIndex >= 0 ? mountedIndex : mediaImportInsertionIndex(blocks, afterId), 0, pending);
  return rendered;
}

const IMPORT_CONCURRENCY = 2;
const DECODE_TIMEOUT_MS = 20_000;
const MAX_MEDIA_BYTES = 80 * 1024 * 1024;

function aborted() { return new DOMException("Import cancelled", "AbortError"); }

/** Preserve the original file. Only two large reads/decodes run at a time. */
function readMedia(file: File, signal: AbortSignal): Promise<string> {
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

function measureMedia(src: string, type: PreparedMedia["type"], signal: AbortSignal): Promise<MediaSize> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(aborted()); return; }
    const image = type === "image" ? new Image() : null;
    const video = type === "video" ? document.createElement("video") : null;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      if (image) { image.onload = image.onerror = null; }
      if (video) {
        video.onloadedmetadata = video.onerror = null;
        video.removeAttribute("src");
        video.load();
      }
    };
    const finish = (size?: MediaSize, error?: unknown) => {
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
        void image.decode().catch(() => {}).then(() => finish({ width: image.naturalWidth, height: image.naturalHeight }));
      };
      image.onerror = () => finish();
      image.src = src;
    } else if (video) {
      video.preload = "metadata";
      video.muted = true;
      video.onloadedmetadata = () => finish({ width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => finish();
      video.src = src;
      video.load();
    }
  });
}

/** Decode first, then hand the editor one ordered batch with stable dimensions. */
export async function prepareMediaFiles(files: readonly File[], {
  signal,
  onProgress,
}: { signal: AbortSignal; onProgress?: (progress: MediaImportProgress) => void }) {
  const prepared: Array<PreparedMedia | null> = Array(files.length).fill(null);
  let cursor = 0, completed = 0;
  onProgress?.({ completed, total: files.length });
  const worker = async () => {
    while (cursor < files.length) {
      if (signal.aborted) throw aborted();
      const index = cursor++, file = files[index];
      try {
        const type = file.type.startsWith("video/") ? "video" : "image";
        if ((!file.type.startsWith("image/") && type !== "video") || /svg|xml/i.test(file.type)
          || file.size === 0 || file.size > MAX_MEDIA_BYTES) throw new Error("Unsupported media");
        const src = await readMedia(file, signal);
        const size = await measureMedia(src, type, signal);
        prepared[index] = { type, src, alt: file.name.replace(/\.[^/.]+$/, ""), ...size };
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw aborted();
        // A damaged file must not prevent the remaining selections from arriving.
      }
      if (signal.aborted) throw aborted();
      onProgress?.({ completed: ++completed, total: files.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, files.length) }, worker));
  if (signal.aborted) throw aborted();
  const media = prepared.filter((item): item is PreparedMedia => item !== null);
  return { media, failed: files.length - media.length };
}
