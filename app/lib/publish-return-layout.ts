import type { MediaSize } from "./media-import";

/** Keep editor layout metadata in memory while the cover picker replaces it.
 * A loaded status outlives the DOM nodes, but their intrinsic dimensions do not.
 * Supplying these dimensions on remount prevents Back from clamping to zero. */
export function capturePublishReturnMedia(canvas: HTMLElement | null): Record<string, MediaSize> {
  const sizes: Record<string, MediaSize> = {};
  for (const block of canvas?.querySelectorAll<HTMLElement>(".image-block[data-block-id], .video-block[data-block-id]") ?? []) {
    const media = block.querySelector<HTMLImageElement | HTMLVideoElement>(".block-crop-content > img, .block-crop-content > video");
    const id = block.dataset.blockId;
    if (!media || !id) continue;
    const bounds = media.getBoundingClientRect();
    const width = media.tagName === "VIDEO" ? (media as HTMLVideoElement).videoWidth : (media as HTMLImageElement).naturalWidth;
    const height = media.tagName === "VIDEO" ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight;
    const size = width > 0 && height > 0 ? { width, height } : { width: bounds.width, height: bounds.height };
    if (Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0) sizes[id] = size;
  }
  return sizes;
}
