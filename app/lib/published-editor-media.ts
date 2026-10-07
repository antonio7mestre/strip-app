type EditorMedia = { id: string; type: string; src?: string; mediaType?: string };
export type EditorMediaStatus = Record<string, "loaded" | "error">;

/** Warm the actual draft URLs while the reader stays painted. Never replace
 * the page with a temporary public copy before the saved draft is ready. */
export async function preparePublishedEditorMedia(blocks: readonly EditorMedia[], signal: AbortSignal) {
  const status: EditorMediaStatus = {};
  await Promise.all(blocks.filter(block => block.src && block.type !== "text").map(block =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
      const video = block.type === "video" || block.mediaType === "video";
      const media = video ? document.createElement("video") : new Image();
      let settled = false;
      const clean = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        media.removeEventListener(video ? "loadeddata" : "load", ready);
        media.removeEventListener("error", failed);
      };
      const finish = (result?: "loaded" | "error") => {
        if (settled) return;
        settled = true;
        clean();
        if (result) status[block.id] = result;
        resolve();
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        clean();
        media.removeAttribute("src");
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const failed = () => finish("error");
      const ready = async () => {
        if (media instanceof HTMLImageElement) {
          await media.decode().catch(() => {});
          finish(media.naturalWidth > 0 ? "loaded" : "error");
        } else finish("loaded");
      };
      // Slow or unavailable media must not trap the user in the reader.
      const timer = setTimeout(() => finish(), 2_000);
      signal.addEventListener("abort", abort, { once: true });
      media.addEventListener(video ? "loadeddata" : "load", ready);
      media.addEventListener("error", failed);
      if (media instanceof HTMLVideoElement) { media.muted = true; media.preload = "auto"; }
      else media.decoding = "async";
      media.src = block.src!;
      if (media instanceof HTMLImageElement && media.complete) {
        if (media.naturalWidth > 0) void ready();
        else failed();
      }
    }),
  ));
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  return status;
}
